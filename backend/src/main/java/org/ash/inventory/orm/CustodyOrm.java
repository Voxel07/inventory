package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.*;
import java.util.List;
import java.util.UUID;
import java.util.Collection;

@ApplicationScoped
public class CustodyOrm {
    private final EntityManager em;
    public CustodyOrm(EntityManager em) { this.em = em; }
    public List<OrderLine> orderLines(UUID actor) {
        var query = em.createQuery("from OrderLine l join fetch l.item i left join fetch i.returnLocation left join fetch i.storageLocation join fetch l.order o join fetch o.createdBy left join fetch o.faction left join fetch o.eventOccurrence where l.handedOverQuantity - l.returnedQuantity - l.consumedQuantity - l.damagedQuantity - l.writtenOffQuantity > 0"
                + (actor == null ? "" : " and o.createdBy.id = :actor"), OrderLine.class);
        if (actor != null) query.setParameter("actor", actor);
        return query.getResultList();
    }
    public java.util.Map<UUID, Item> items(Collection<UUID> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        return em.createQuery("from Item i left join fetch i.returnLocation left join fetch i.storageLocation where i.id in :ids", Item.class)
                .setParameter("ids", ids).getResultStream().collect(java.util.stream.Collectors.toMap(i -> i.id, i -> i));
    }
    public record Direct(Item item, UserAccount user, EventOccurrence event, UUID asset, int quantity) {}
    public List<Direct> directBalances(UUID actor) {
        var query = em.createQuery("""
                select t.item.id, t.user.id, e.id, a.id,
                    sum(case when t.type = checkout then t.quantity
                        when t.type = checkin or t.type = consumed or (t.type = written_off and t.custodyWriteOff = true)
                        then -t.quantity else 0 end)
                from StockTransaction t left join t.eventOccurrence e left join t.assetInstance a
                where t.order is null and t.relatedEntityType is null
                    and (t.type in (checkout, checkin, consumed) or (t.type = written_off and t.custodyWriteOff = true))
                """ + (actor == null ? "" : " and t.user.id = :actor") + " group by t.item.id, t.user.id, e.id, a.id", Object[].class);
        if (actor != null) query.setParameter("actor", actor);
        var rows = query.getResultList().stream().filter(row -> ((Number) row[4]).longValue() > 0).toList();
        var items = items(rows.stream().map(row -> (UUID) row[0]).distinct().toList());
        var users = batch(UserAccount.class, rows.stream().map(row -> (UUID) row[1]).distinct().toList());
        var events = batch(EventOccurrence.class, rows.stream().map(row -> (UUID) row[2]).filter(java.util.Objects::nonNull).distinct().toList());
        return rows.stream().map(row -> new Direct(items.get(row[0]), users.get(row[1]), row[2] == null ? null : events.get(row[2]), (UUID) row[3], Math.toIntExact(((Number) row[4]).longValue()))).toList();
    }
    /** Positive direct custody groups (custodian, event) for one bulk item, or for one serialized asset. */
    public record DirectSource(UUID user, UUID event, int quantity) {}
    public List<DirectSource> directSources(UUID item, UUID asset) {
        var query = em.createQuery("""
                select t.user.id, e.id,
                    sum(case when t.type = checkout then t.quantity
                        when t.type = checkin or t.type = consumed or (t.type = written_off and t.custodyWriteOff = true)
                        then -t.quantity else 0 end)
                from StockTransaction t left join t.eventOccurrence e
                where t.order is null and t.relatedEntityType is null and t.item.id = :item
                    and (t.type in (checkout, checkin, consumed) or (t.type = written_off and t.custodyWriteOff = true))
                """ + (asset == null ? " and t.assetInstance is null" : " and t.assetInstance.id = :asset")
                + " group by t.user.id, e.id", Object[].class).setParameter("item", item);
        if (asset != null) query.setParameter("asset", asset);
        return query.getResultList().stream().filter(row -> ((Number) row[2]).longValue() > 0)
                .map(row -> new DirectSource((UUID) row[0], (UUID) row[1], Math.toIntExact(((Number) row[2]).longValue()))).toList();
    }
    private <T extends BaseEntity> java.util.Map<UUID, T> batch(Class<T> type, List<UUID> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        return em.createQuery("from " + type.getSimpleName() + " e where e.id in :ids", type).setParameter("ids", ids)
                .getResultStream().collect(java.util.stream.Collectors.toMap(e -> e.id, e -> e));
    }
    public List<Object[]> pending(UUID actor) {
        var query = em.createQuery("""
                select r.item.id, r.returnedFor.id, e.id, o.id, o.kind, a.id, sum(r.quantity)
                from ReturnSubmission r left join r.eventOccurrence e left join r.order o left join r.assetInstance a where r.status = pending
                """ + (actor == null ? "" : " and r.returnedFor.id = :actor")
                + " group by r.item.id, r.returnedFor.id, e.id, o.kind, o.id, a.id", Object[].class);
        if (actor != null) query.setParameter("actor", actor);
        return query.getResultList();
    }
    public boolean hasOutstandingAsset(UUID assetId) {
        long direct = em.createQuery("""
                select coalesce(sum(case when t.type = :checkout then t.quantity
                    when t.type = :checkin or t.type = :consumed or (t.type = :writtenOff and t.custodyWriteOff = true)
                    then -t.quantity else 0 end), 0)
                from StockTransaction t where t.assetInstance.id = :asset
                    and t.order is null and t.relatedEntityType is null
                """, Long.class).setParameter("asset", assetId)
                .setParameter("checkout", DomainEnums.TransactionType.checkout)
                .setParameter("checkin", DomainEnums.TransactionType.checkin)
                .setParameter("consumed", DomainEnums.TransactionType.consumed)
                .setParameter("writtenOff", DomainEnums.TransactionType.written_off).getSingleResult();
        if (direct > 0) return true;
        long faction = em.createQuery("""
                select count(l) from CustodyHandoverLine l
                where l.assetInstance.id = :asset and l.handover.type = :checkout
                    and not exists (select r.id from ReturnReconciliation r
                        where r.assetInstance.id = :asset and r.order = l.handover.order
                            and r.outcome <> :missing)
                """, Long.class).setParameter("asset", assetId)
                .setParameter("checkout", DomainEnums.HandoverType.checkout)
                .setParameter("missing", DomainEnums.ReconciliationOutcome.missing).getSingleResult();
        return faction > 0;
    }
    public List<CustodyHandover> handovers(UUID orderId, int offset, int limit) {
        return em.createQuery("""
                select handover from CustodyHandover handover
                join fetch handover.order join fetch handover.marshal left join fetch handover.collector
                left join fetch handover.location
                where handover.order.id = :orderId order by handover.occurredAt desc
                """, CustodyHandover.class)
                .setParameter("orderId", orderId).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<CustodyHandoverLine> lines(Collection<CustodyHandover> handovers) {
        if (handovers.isEmpty()) return List.of();
        return em.createQuery("""
                select line from CustodyHandoverLine line join fetch line.orderLine
                join fetch line.item left join fetch line.assetInstance
                where line.handover in :handovers order by line.createdAt
                """, CustodyHandoverLine.class)
                .setParameter("handovers", handovers).getResultList();
    }

    public List<ReturnReconciliation> reconciliations(UUID orderId, int offset, int limit) {
        return em.createQuery("""
                select reconciliation from ReturnReconciliation reconciliation
                join fetch reconciliation.order join fetch reconciliation.orderLine
                join fetch reconciliation.item left join fetch reconciliation.assetInstance
                join fetch reconciliation.recordedBy
                where reconciliation.order.id = :orderId order by reconciliation.createdAt desc
                """, ReturnReconciliation.class)
                .setParameter("orderId", orderId).setFirstResult(offset).setMaxResults(limit).getResultList();
    }
}
