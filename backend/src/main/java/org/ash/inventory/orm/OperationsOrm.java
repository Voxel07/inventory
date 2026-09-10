package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.AssetInstance;
import org.ash.inventory.model.DamageReport;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.FactionOrderLine;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.MaintenanceRecord;
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

    public Map<DomainEnums.TransactionType, Long> transactionTotals(Item item) {
        var totals = new EnumMap<DomainEnums.TransactionType, Long>(DomainEnums.TransactionType.class);
        for (var row : entityManager.createQuery(
                "select tx.type, sum(tx.quantity) from StockTransaction tx where tx.item = :item group by tx.type",
                Object[].class).setParameter("item", item).getResultList()) {
            totals.put((DomainEnums.TransactionType) row[0], (Long) row[1]);
        }
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
        return totals;
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
        return Math.toIntExact(quantity);
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

    public Item findLockedItem(UUID id) { return entityManager.find(Item.class, id, LockModeType.PESSIMISTIC_WRITE); }
    public DamageReport findLockedDamage(UUID id) { return entityManager.find(DamageReport.class, id, LockModeType.PESSIMISTIC_WRITE); }
    public <T> T find(Class<T> type, UUID id) { return entityManager.find(type, id); }
    public void persist(Object entity) { entityManager.persist(entity); }

    public List<AssetInstance> assetsForItem(Item item) {
        return entityManager.createQuery("from AssetInstance a where a.item = :item and a.active = true", AssetInstance.class)
                .setParameter("item", item).getResultList();
    }

    public List<AssetInstance> assetsForItems(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return List.of();
        return entityManager.createQuery("from AssetInstance a where a.item.id in :itemIds and a.active = true", AssetInstance.class)
                .setParameter("itemIds", itemIds).getResultList();
    }
}
