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
    public List<FactionOrderLine> factionLines(UUID actor) {
        var query = em.createQuery("from FactionOrderLine l join fetch l.item i left join fetch i.returnLocation left join fetch i.storageLocation join fetch l.order o join fetch o.createdBy join fetch o.faction join fetch o.eventOccurrence where l.handedOverQuantity - l.returnedQuantity - l.consumedQuantity - l.damagedQuantity - l.writtenOffQuantity > 0"
                + (actor == null ? "" : " and o.createdBy.id = :actor"), FactionOrderLine.class);
        if (actor != null) query.setParameter("actor", actor);
        return query.getResultList();
    }
    public List<GeneralOrder> generalOrders(UUID actor) {
        var idsQuery = em.createNativeQuery("""
                select o.id from general_orders o where o.status in ('picked_up', 'partially_returned')
                and exists (select 1 from jsonb_each_text(o.handed_over_quantities) q
                    where q.value::bigint - coalesce((o.returned_quantities ->> q.key)::bigint, 0)
                        - coalesce((o.consumed_quantities ->> q.key)::bigint, 0)
                        - coalesce((o.damaged_quantities ->> q.key)::bigint, 0)
                        - coalesce((o.written_off_quantities ->> q.key)::bigint, 0) > 0)
                """ + (actor == null ? "" : " and o.created_by = :actor"), UUID.class);
        if (actor != null) idsQuery.setParameter("actor", actor);
        var ids = idsQuery.getResultList();
        if (ids.isEmpty()) return List.of();
        return em.createQuery("from GeneralOrder o join fetch o.createdBy left join fetch o.eventOccurrence where o.id in :ids", GeneralOrder.class)
                .setParameter("ids", ids).getResultList();
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
                where t.factionOrder is null and t.relatedEntityType is null
                    and (t.type in (checkout, checkin, consumed) or (t.type = written_off and t.custodyWriteOff = true))
                """ + (actor == null ? "" : " and t.user.id = :actor") + " group by t.item.id, t.user.id, e.id, a.id", Object[].class);
        if (actor != null) query.setParameter("actor", actor);
        var rows = query.getResultList().stream().filter(row -> ((Number) row[4]).longValue() > 0).toList();
        var items = items(rows.stream().map(row -> (UUID) row[0]).distinct().toList());
        var users = batch(UserAccount.class, rows.stream().map(row -> (UUID) row[1]).distinct().toList());
        var events = batch(EventOccurrence.class, rows.stream().map(row -> (UUID) row[2]).filter(java.util.Objects::nonNull).distinct().toList());
        return rows.stream().map(row -> new Direct(items.get(row[0]), users.get(row[1]), row[2] == null ? null : events.get(row[2]), (UUID) row[3], Math.toIntExact(((Number) row[4]).longValue()))).toList();
    }
    private <T extends BaseEntity> java.util.Map<UUID, T> batch(Class<T> type, List<UUID> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        return em.createQuery("from " + type.getSimpleName() + " e where e.id in :ids", type).setParameter("ids", ids)
                .getResultStream().collect(java.util.stream.Collectors.toMap(e -> e.id, e -> e));
    }
    public List<Object[]> pending(UUID actor) {
        var query = em.createQuery("""
                select r.item.id, r.returnedFor.id, e.id, f.id, g.id, a.id, sum(r.quantity)
                from ReturnSubmission r left join r.eventOccurrence e left join r.factionOrder f
                left join r.generalOrder g left join r.assetInstance a where r.status = pending
                """ + (actor == null ? "" : " and r.returnedFor.id = :actor")
                + " group by r.item.id, r.returnedFor.id, e.id, f.id, g.id, a.id", Object[].class);
        if (actor != null) query.setParameter("actor", actor);
        return query.getResultList();
    }
    public boolean hasOutstandingAsset(UUID assetId) {
        long direct = em.createQuery("""
                select coalesce(sum(case when t.type = :checkout then t.quantity
                    when t.type = :checkin or t.type = :consumed or (t.type = :writtenOff and t.custodyWriteOff = true)
                    then -t.quantity else 0 end), 0)
                from StockTransaction t where t.assetInstance.id = :asset
                    and t.factionOrder is null and t.relatedEntityType is null
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
        if (faction > 0) return true;
        return (Boolean) em.createNativeQuery("""
                select exists (select 1 from general_orders o
                    cross join lateral jsonb_each(o.asset_assignments) assignment
                    cross join lateral jsonb_array_elements_text(assignment.value) asset
                    where o.status in ('picked_up', 'partially_returned') and asset.value = :asset
                    and not coalesce(o.reconciled_assets -> assignment.key, '[]'::jsonb) @> jsonb_build_array(cast(:asset as text)))
                """, Boolean.class).setParameter("asset", assetId.toString()).getSingleResult();
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
