package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.MaintenanceRecord;
import org.ash.inventory.model.StockTransaction;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Database access for stock, damage, maintenance, and procurement views. */
@ApplicationScoped
public class OperationsOrm {
    @Inject EntityManager entityManager;

    public List<StockTransaction> transactions(UUID itemId, UUID userId, String type, Instant start, Instant end) {
        var jpql = new StringBuilder("from StockTransaction tx where 1 = 1");
        if (itemId != null) jpql.append(" and tx.item.id = :itemId");
        if (userId != null) jpql.append(" and tx.user.id = :userId");
        if (type != null && !type.isBlank()) jpql.append(" and tx.type = :type");
        if (start != null) jpql.append(" and tx.occurredAt >= :start");
        if (end != null) jpql.append(" and tx.occurredAt <= :end");
        jpql.append(" order by tx.occurredAt desc");
        var query = entityManager.createQuery(jpql.toString(), StockTransaction.class);
        if (itemId != null) query.setParameter("itemId", itemId);
        if (userId != null) query.setParameter("userId", userId);
        if (type != null && !type.isBlank()) query.setParameter("type", DomainEnums.TransactionType.valueOf(type));
        if (start != null) query.setParameter("start", start);
        if (end != null) query.setParameter("end", end);
        return query.getResultList();
    }

    public List<DamageReport> damageReports(UUID itemId) {
        if (itemId == null) return entityManager.createQuery("from DamageReport d order by d.createdAt desc", DamageReport.class).getResultList();
        return entityManager.createQuery("from DamageReport d where d.item.id = :itemId order by d.createdAt desc", DamageReport.class)
                .setParameter("itemId", itemId).getResultList();
    }

    public List<MaintenanceRecord> maintenanceRecords(UUID itemId) {
        if (itemId == null) return entityManager.createQuery("from MaintenanceRecord m order by m.performedAt desc", MaintenanceRecord.class).getResultList();
        return entityManager.createQuery("from MaintenanceRecord m where m.item.id = :itemId order by m.performedAt desc", MaintenanceRecord.class)
                .setParameter("itemId", itemId).getResultList();
    }

    public StockTransaction transactionByIdempotencyKey(UUID key) {
        return entityManager.createQuery("from StockTransaction tx where tx.idempotencyKey = :key", StockTransaction.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }

    public DamageReport damageByIdempotencyKey(UUID key) {
        return entityManager.createQuery("from DamageReport d where d.idempotencyKey = :key", DamageReport.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }

    public List<StockTransaction> transactions(Item item) {
        return entityManager.createQuery("from StockTransaction tx where tx.item = :item", StockTransaction.class)
                .setParameter("item", item).getResultList();
    }

    public List<DamageReport> unresolvedDamage(Item item) {
        return entityManager.createQuery("from DamageReport d where d.item = :item and d.status in :statuses", DamageReport.class)
                .setParameter("item", item)
                .setParameter("statuses", List.of(DomainEnums.DamageStatus.reported, DomainEnums.DamageStatus.in_review))
                .getResultList();
    }

    public List<FactionOrderLine> reservedLines(Item item) {
        return entityManager.createQuery("from FactionOrderLine line where line.item = :item and line.order.status in :statuses", FactionOrderLine.class)
                .setParameter("item", item)
                .setParameter("statuses", List.of(DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.ready))
                .getResultList();
    }

    public List<FactionOrderLine> activeOrderLines(UUID eventOccurrenceId, List<DomainEnums.OrderStatus> statuses) {
        if (eventOccurrenceId == null) {
            return entityManager.createQuery("from FactionOrderLine line where line.order.status in :statuses", FactionOrderLine.class)
                    .setParameter("statuses", statuses).getResultList();
        }
        return entityManager.createQuery("from FactionOrderLine line where line.order.status in :statuses and line.order.eventOccurrence.id = :eventId", FactionOrderLine.class)
                .setParameter("statuses", statuses).setParameter("eventId", eventOccurrenceId).getResultList();
    }

    public Item findLockedItem(UUID id) { return entityManager.find(Item.class, id, LockModeType.PESSIMISTIC_WRITE); }
    public DamageReport findLockedDamage(UUID id) { return entityManager.find(DamageReport.class, id, LockModeType.PESSIMISTIC_WRITE); }
    public <T> T find(Class<T> type, UUID id) { return entityManager.find(type, id); }
    public void persist(Object entity) { entityManager.persist(entity); }
}
