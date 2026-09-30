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
    public List<FactionOrderLine> factionLines() {
        return em.createQuery("from FactionOrderLine l join fetch l.item join fetch l.order o join fetch o.createdBy join fetch o.eventOccurrence where l.handedOverQuantity > 0", FactionOrderLine.class).getResultList();
    }
    public List<GeneralOrder> generalOrders() {
        return em.createQuery("from GeneralOrder o join fetch o.createdBy left join fetch o.eventOccurrence where o.status in ('picked_up', 'partially_returned')", GeneralOrder.class).getResultList();
    }
    public List<StockTransaction> directTransactions() {
        return em.createQuery("from StockTransaction t join fetch t.item join fetch t.user left join fetch t.assetInstance left join fetch t.eventOccurrence where t.factionOrder is null and t.relatedEntityType is null order by t.occurredAt, t.id", StockTransaction.class).getResultList();
    }
    public List<ReturnSubmission> pending() {
        return em.createQuery("from ReturnSubmission r where r.status = :status", ReturnSubmission.class).setParameter("status", DomainEnums.ReturnSubmissionStatus.pending).getResultList();
    }
    public Item item(String id) { return em.find(Item.class, java.util.UUID.fromString(id)); }
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
        String id = assetId.toString();
        return generalOrders().stream().anyMatch(order -> order.assetAssignments.entrySet().stream()
                .anyMatch(entry -> entry.getValue().contains(id)
                        && !order.reconciledAssets.getOrDefault(entry.getKey(), List.of()).contains(id)));
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
