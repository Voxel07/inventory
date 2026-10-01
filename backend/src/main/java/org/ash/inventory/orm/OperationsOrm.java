package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.InventoryPosition;
import org.ash.inventory.model.MaintenanceRecord;
import org.ash.inventory.model.MaintenanceSchedule;
import org.ash.inventory.model.StockTransaction;
import org.ash.inventory.model.StockReservation;

import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.EnumMap;
import java.util.Map;
import java.util.UUID;

/** Database access for stock, damage, maintenance, and procurement views. */
@ApplicationScoped
public class OperationsOrm {
    @jakarta.inject.Inject protected org.ash.inventory.helper.security.ActorService accessActor;
    private final EntityManager entityManager;

    public OperationsOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    public List<Item> minStockItems() {
        return entityManager.createQuery("from Item i where i.active = true and i.minStock > 0", Item.class).getResultList();
    }

    public List<StockTransaction> transactions(UUID itemId, UUID assetInstanceId, UUID userId, String type, Instant start, Instant end,
            int offset, int limit) {
        var jpql = new StringBuilder("from StockTransaction tx where " + InventoryAccessOrm.visible("tx.item.accessPolicy"));
        if (itemId != null) jpql.append(" and tx.item.id = :itemId");
        if (assetInstanceId != null) jpql.append(" and tx.assetInstance.id = :assetInstanceId");
        if (userId != null) jpql.append(" and tx.user.id = :userId");
        if (type != null && !type.isBlank()) jpql.append(" and tx.type = :type");
        if (start != null) jpql.append(" and tx.occurredAt >= :start");
        if (end != null) jpql.append(" and tx.occurredAt <= :end");
        jpql.append(" order by tx.occurredAt desc, tx.id desc");
        var query = entityManager.createQuery(jpql.toString(), StockTransaction.class);
        if (itemId != null) query.setParameter("itemId", itemId);
        if (assetInstanceId != null) query.setParameter("assetInstanceId", assetInstanceId);
        if (userId != null) query.setParameter("userId", userId);
        if (type != null && !type.isBlank()) query.setParameter("type", DomainEnums.TransactionType.valueOf(type));
        if (start != null) query.setParameter("start", start);
        if (end != null) query.setParameter("end", end);
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<DamageReport> damageReports(UUID itemId, UUID assetInstanceId, UUID assemblyId, int offset, int limit) {
        var jpql = new StringBuilder("select d from DamageReport d left join d.item di where (di is null or " + InventoryAccessOrm.visible("di.accessPolicy") + ")");
        if (itemId != null) jpql.append(" and d.item.id = :itemId");
        if (assetInstanceId != null) jpql.append(" and d.assetInstance.id = :assetInstanceId");
        if (assemblyId != null) jpql.append(" and d.assembly.id = :assemblyId");
        jpql.append(" order by d.createdAt desc");
        var query = entityManager.createQuery(jpql.toString(), DamageReport.class);
        if (itemId != null) query.setParameter("itemId", itemId);
        if (assetInstanceId != null) query.setParameter("assetInstanceId", assetInstanceId);
        if (assemblyId != null) query.setParameter("assemblyId", assemblyId);
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<MaintenanceRecord> maintenanceRecords(UUID itemId, int offset, int limit) {
        if (itemId == null) return InventoryAccessOrm.bind(entityManager.createQuery("from MaintenanceRecord m where " + InventoryAccessOrm.visible("m.item.accessPolicy") + " order by m.performedAt desc", MaintenanceRecord.class), accessActor.current())
                .setFirstResult(offset).setMaxResults(limit).getResultList();
        return InventoryAccessOrm.bind(entityManager.createQuery("from MaintenanceRecord m where m.item.id = :itemId and " + InventoryAccessOrm.visible("m.item.accessPolicy") + " order by m.performedAt desc", MaintenanceRecord.class), accessActor.current())
                .setParameter("itemId", itemId).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<MaintenanceSchedule> blockingSchedules(Item item, AssetInstance asset) {
        var jpql = asset == null
                ? "from MaintenanceSchedule schedule where schedule.item = :item and schedule.active = true and schedule.checkoutBlocking = true and schedule.assetInstance is null"
                : "from MaintenanceSchedule schedule where schedule.item = :item and schedule.active = true and schedule.checkoutBlocking = true and (schedule.assetInstance is null or schedule.assetInstance = :asset)";
        var query = entityManager.createQuery(jpql, MaintenanceSchedule.class).setParameter("item", item);
        if (asset != null) query.setParameter("asset", asset);
        return query.getResultList();
    }

    public List<MaintenanceSchedule> schedules(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return List.of();
        return entityManager.createQuery("from MaintenanceSchedule s join fetch s.item left join fetch s.assetInstance where s.item.id in :ids and s.active = true", MaintenanceSchedule.class)
                .setParameter("ids", itemIds).getResultList();
    }

    public List<Object[]> checkoutCounts(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return List.of();
        return entityManager.createQuery("select t.item.id, a.id, count(t) from StockTransaction t left join t.assetInstance a where t.item.id in :ids and t.type = :type group by t.item.id, a.id", Object[].class)
                .setParameter("ids", itemIds).setParameter("type", DomainEnums.TransactionType.checkout).getResultList();
    }

    public long checkoutCount(Item item, AssetInstance asset) {
        var jpql = asset == null
                ? "select count(tx) from StockTransaction tx where tx.item = :item and tx.type = :type"
                : "select count(tx) from StockTransaction tx where tx.assetInstance = :asset and tx.type = :type";
        var query = entityManager.createQuery(jpql, Long.class)
                .setParameter("type", DomainEnums.TransactionType.checkout);
        if (asset == null) query.setParameter("item", item); else query.setParameter("asset", asset);
        return query.getSingleResult();
    }

    public StockTransaction transactionByIdempotencyKey(UUID key) {
        return entityManager.createQuery("from StockTransaction tx where tx.idempotencyKey = :key", StockTransaction.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }

    public AssetInstance findLockedAsset(UUID id) {
        return accessActor.protect(entityManager.find(AssetInstance.class, id, LockModeType.PESSIMISTIC_WRITE), true);
    }

    public DamageReport damageByIdempotencyKey(UUID key) {
        return entityManager.createQuery("from DamageReport d where d.idempotencyKey = :key", DamageReport.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }

    public Map<DomainEnums.TransactionType, Long> transactionTotals(Item item) {
        var totals = new EnumMap<DomainEnums.TransactionType, Long>(DomainEnums.TransactionType.class);
        for (var row : entityManager.createQuery(
                "select tx.type, sum(tx.quantity) from StockTransaction tx where tx.item = :item group by tx.type",
                Object[].class).setParameter("item", item).getResultList()) {
            totals.put((DomainEnums.TransactionType) row[0], (Long) row[1]);
        }
        normalizeCustodyWriteOff(totals, entityManager.createQuery("select coalesce(sum(tx.quantity), 0) from StockTransaction tx where tx.item = :item and tx.custodyWriteOff = true", Long.class).setParameter("item", item).getSingleResult());
        return totals;
    }

    public Map<UUID, Map<DomainEnums.TransactionType, Long>> transactionTotals(Collection<UUID> itemIds) {
        var totals = new LinkedHashMap<UUID, Map<DomainEnums.TransactionType, Long>>();
        if (itemIds.isEmpty()) return totals;
        for (var row : entityManager.createQuery("""
                select tx.item.id, tx.type, sum(tx.quantity)
                from StockTransaction tx
                where tx.item.id in :itemIds
                group by tx.item.id, tx.type
                """, Object[].class).setParameter("itemIds", itemIds).getResultList()) {
            UUID itemId = (UUID) row[0];
            totals.computeIfAbsent(itemId, ignored -> new EnumMap<>(DomainEnums.TransactionType.class))
                    .put((DomainEnums.TransactionType) row[1], (Long) row[2]);
        }
        for (var row : entityManager.createQuery("select tx.item.id, sum(tx.quantity) from StockTransaction tx where tx.item.id in :ids and tx.custodyWriteOff = true group by tx.item.id", Object[].class).setParameter("ids", itemIds).getResultList())
            normalizeCustodyWriteOff(totals.get((UUID) row[0]), (Long) row[1]);
        return totals;
    }

    private void normalizeCustodyWriteOff(Map<DomainEnums.TransactionType, Long> totals, long quantity) {
        // A custody loss reduces checked-out stock, never the physical warehouse balance.
        // The ledger retains written_off; only this internal stock arithmetic groups its effect with consumption.
        if (quantity == 0) return;
        totals.merge(DomainEnums.TransactionType.written_off, -quantity, Long::sum);
        totals.merge(DomainEnums.TransactionType.consumed, quantity, Long::sum);
    }

    public List<DamageReport> unresolvedDamage(Item item) {
        return entityManager.createQuery("from DamageReport d where d.item = :item and d.status in :statuses", DamageReport.class)
                .setParameter("item", item)
                .setParameter("statuses", List.of(DomainEnums.DamageStatus.reported, DomainEnums.DamageStatus.triaged,
                        DomainEnums.DamageStatus.awaiting_repair, DomainEnums.DamageStatus.in_review,
                        DomainEnums.DamageStatus.in_repair, DomainEnums.DamageStatus.repaired,
                        DomainEnums.DamageStatus.verified))
                .getResultList();
    }

    public int unresolvedDamageQuantity(Item item) {
        Long quantity = entityManager.createQuery("""
                select coalesce(sum(d.quantity - d.repairedQuantity - d.writtenOffQuantity), 0)
                from DamageReport d where d.item = :item and d.status in :statuses
                """, Long.class)
                .setParameter("item", item)
                .setParameter("statuses", List.of(DomainEnums.DamageStatus.reported, DomainEnums.DamageStatus.triaged,
                        DomainEnums.DamageStatus.awaiting_repair, DomainEnums.DamageStatus.in_review,
                        DomainEnums.DamageStatus.in_repair, DomainEnums.DamageStatus.repaired,
                        DomainEnums.DamageStatus.verified))
                .getSingleResult();
        return Math.toIntExact(quantity);
    }

    public Map<UUID, Long> unresolvedDamageQuantities(Collection<UUID> itemIds) {
        var quantities = new LinkedHashMap<UUID, Long>();
        if (itemIds.isEmpty()) return quantities;
        for (var row : entityManager.createQuery("""
                select d.item.id, coalesce(sum(d.quantity - d.repairedQuantity - d.writtenOffQuantity), 0)
                from DamageReport d
                where d.item.id in :itemIds and d.status in :statuses
                group by d.item.id
                """, Object[].class)
                .setParameter("itemIds", itemIds)
                .setParameter("statuses", List.of(DomainEnums.DamageStatus.reported, DomainEnums.DamageStatus.triaged,
                        DomainEnums.DamageStatus.awaiting_repair, DomainEnums.DamageStatus.in_review,
                        DomainEnums.DamageStatus.in_repair, DomainEnums.DamageStatus.repaired,
                        DomainEnums.DamageStatus.verified))
                .getResultList()) {
            quantities.put((UUID) row[0], (Long) row[1]);
        }
        return quantities;
    }

    public List<StockReservation> activeReservations(Item item) {
        return entityManager.createQuery("from StockReservation reservation where reservation.item = :item and reservation.status in :statuses", StockReservation.class)
                .setParameter("item", item)
                .setParameter("statuses", List.of(DomainEnums.ReservationStatus.active, DomainEnums.ReservationStatus.partially_released))
                .getResultList();
    }

    public int activeReservationQuantity(Item item) {
        Long quantity = entityManager.createQuery("""
                select coalesce(sum(reservation.reservedQuantity - reservation.releasedQuantity), 0)
                from StockReservation reservation
                where reservation.item = :item and reservation.status in :statuses
                """, Long.class)
                .setParameter("item", item)
                .setParameter("statuses", List.of(DomainEnums.ReservationStatus.active,
                        DomainEnums.ReservationStatus.partially_released))
                .getSingleResult();
        return Math.toIntExact(quantity + generalReservations().getOrDefault(item.id, 0L));
    }

    public Map<UUID, Long> generalReservations() {
        var result = new LinkedHashMap<UUID, Long>();
        for (var order : entityManager.createQuery("from GeneralOrder o where o.status in ('preparing', 'ready')", org.ash.inventory.model.GeneralOrder.class).getResultList())
            order.preparedQuantities.forEach((id, quantity) -> result.merge(UUID.fromString(id), quantity.longValue(), Long::sum));
        return result;
    }

    public Map<UUID, Long> inTransitQuantities(Collection<UUID> itemIds) {
        var result = new LinkedHashMap<UUID, Long>();
        if (itemIds.isEmpty()) return result;
        for (var row : entityManager.createQuery("select p.item.id, sum(p.quantityInTransit) from InventoryPosition p where p.item.id in :ids group by p.item.id", Object[].class)
                .setParameter("ids", itemIds).getResultList()) result.put((UUID) row[0], (Long) row[1]);
        return result;
    }

    public Map<UUID, Long> activeReservationQuantities(Collection<UUID> itemIds) {
        var quantities = new LinkedHashMap<UUID, Long>();
        if (itemIds.isEmpty()) return quantities;
        for (var row : entityManager.createQuery("""
                select reservation.item.id,
                       coalesce(sum(reservation.reservedQuantity - reservation.releasedQuantity), 0)
                from StockReservation reservation
                where reservation.item.id in :itemIds and reservation.status in :statuses
                group by reservation.item.id
                """, Object[].class)
                .setParameter("itemIds", itemIds)
                .setParameter("statuses", List.of(DomainEnums.ReservationStatus.active,
                        DomainEnums.ReservationStatus.partially_released))
                .getResultList()) {
            quantities.put((UUID) row[0], (Long) row[1]);
        }
        generalReservations().forEach((id, quantity) -> { if (itemIds.contains(id)) quantities.merge(id, quantity, Long::sum); });
        return quantities;
    }

    public List<FactionOrderLine> activeOrderLines(UUID eventOccurrenceId, List<DomainEnums.OrderStatus> statuses) {
        if (eventOccurrenceId == null) {
            return entityManager.createQuery("from FactionOrderLine line where line.order.status in :statuses", FactionOrderLine.class)
                    .setParameter("statuses", statuses).getResultList();
        }
        return entityManager.createQuery("from FactionOrderLine line where line.order.status in :statuses and line.order.eventOccurrence.id = :eventId", FactionOrderLine.class)
                .setParameter("statuses", statuses).setParameter("eventId", eventOccurrenceId).getResultList();
    }

    public Item findLockedItem(UUID id) { return accessActor.protect(entityManager.find(Item.class, id, LockModeType.PESSIMISTIC_WRITE), true); }
    public DamageReport findLockedDamage(UUID id) { return accessActor.protect(entityManager.find(DamageReport.class, id, LockModeType.PESSIMISTIC_WRITE), true); }
    public <T> T find(Class<T> type, UUID id) { return accessActor.protect(entityManager.find(type, id), false); }
    public void persist(Object entity) { entityManager.persist(entity); }

    public List<AssetInstance> assetsForItem(Item item) {
        return entityManager.createQuery("from AssetInstance a where a.item = :item and a.active = true", AssetInstance.class)
                .setParameter("item", item).getResultList();
    }

    public List<AssetInstance> assetsForItems(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return List.of();
        return entityManager.createQuery("from AssetInstance a join fetch a.item left join fetch a.currentLocation left join fetch a.currentCustodian where a.item.id in :itemIds and a.active = true", AssetInstance.class)
                .setParameter("itemIds", itemIds).getResultList();
    }
}
