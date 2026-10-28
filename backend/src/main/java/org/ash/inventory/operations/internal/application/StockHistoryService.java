package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.StockHistory;
import org.ash.inventory.platform.runtime.WorkerRoles;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Synchronization;
import jakarta.transaction.TransactionSynchronizationRegistry;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Snapshots share the command's commit; a clock sweep also observes holds becoming due without a command. */
@ApplicationScoped
public class StockHistoryService {
    private static final Object REGISTERED = new Object();
    private static final int BATCH_SIZE = 200;
    @Inject EntityManager em;
    @Inject TransactionSynchronizationRegistry transactions;
    @Inject StockReadService stocks;
    @Inject EquipmentPolicy policy;
    @Inject WorkerRoles workers;
    @Inject DomainEventService events;

    void commandRecorded(@Observes DomainEventService.Recorded event) {
        if (transactions.getResource(REGISTERED) != null) return;
        transactions.putResource(REGISTERED, Boolean.TRUE);
        transactions.registerInterposedSynchronization(new Synchronization() {
            public void beforeCompletion() { captureCommand(); }
            public void afterCompletion(int status) {}
        });
    }

    private void captureCommand() {
        // Flushing first lets the row triggers identify every affected item, including multi-item commands.
        em.flush();
        @SuppressWarnings("unchecked")
        List<UUID> ids = em.createNativeQuery("select item_id from stock_history_pending where transaction_id = txid_current() order by item_id")
                .getResultList();
        for (int from = 0; from < ids.size(); from += BATCH_SIZE) {
            capture(em.createQuery("from Item i where i.id in :ids order by i.id", Item.class)
                    .setParameter("ids", ids.subList(from, Math.min(from + BATCH_SIZE, ids.size()))).getResultList(), false);
        }
        em.createNativeQuery("delete from stock_history_pending where transaction_id = txid_current()").executeUpdate();
        em.flush();
    }

    private void capture(List<Item> items, boolean announce) {
        if (items.isEmpty()) return;
        var ids = items.stream().map(i -> i.id).toList();
        var latest = em.createQuery("from StockHistory h where h.item.id in :ids and h.sequence = "
                + "(select max(previous.sequence) from StockHistory previous where previous.item = h.item)", StockHistory.class)
                .setParameter("ids", ids).getResultList().stream()
                .collect(java.util.stream.Collectors.toMap(h -> h.item.id, h -> h));
        var facts = stocks.readStock(items);
        for (var item : items) {
            var read = facts.get(item.id);
            int total = read.physical().totalOwned();
            int available = policy.available(item, null, read.physical(), 0, read.policy());
            var previous = latest.get(item.id);
            if (previous != null && previous.total == total && previous.available == available) continue;
            var snapshot = new StockHistory();
            snapshot.item = item;
            snapshot.total = total;
            snapshot.available = available;
            em.persist(snapshot);
            if (announce) events.record("stock.changed", "item", item.id, null, null,
                    Map.of("itemId", item.id.toString(), "reason", "availability"));
        }
    }

    @Scheduled(every = "1m", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    public void observeClockChanges() {
        if (!workers.enabled("stock-history")) return;
        UUID after = new UUID(0, 0);
        while (true) {
            var last = capturePage(after);
            if (last == null) return;
            after = last;
        }
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public UUID capturePage(UUID after) {
        // Skip command-held rows; their own commit captures them. Item locks serialize snapshots with stock commands.
        @SuppressWarnings("unchecked")
        List<UUID> ids = em.createNativeQuery("select id from items where active=true and id > :after order by id limit :limit for update skip locked")
                .setParameter("after", after).setParameter("limit", BATCH_SIZE).getResultList();
        if (ids.isEmpty()) return null;
        capture(em.createQuery("from Item i where i.id in :ids order by i.id", Item.class).setParameter("ids", ids).getResultList(), true);
        em.createNativeQuery("delete from stock_history_pending where item_id in :ids").setParameter("ids", ids).executeUpdate();
        return ids.getLast();
    }

    public List<ApiResponses.StockHistoryResponse> history(Item item, int offset, int limit) {
        return em.createQuery("from StockHistory h where h.item = :item order by h.sequence", StockHistory.class)
                .setParameter("item", item).setFirstResult(offset).setMaxResults(limit).getResultList().stream()
                .map(h -> new ApiResponses.StockHistoryResponse(h.id, h.createdAt, h.total, h.available)).toList();
    }
}
