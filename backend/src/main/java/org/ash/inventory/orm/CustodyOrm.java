package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.CustodyHandover;
import org.ash.inventory.model.CustodyHandoverLine;
import org.ash.inventory.model.ReturnReconciliation;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class CustodyOrm {
    private final EntityManager entityManager;

    public CustodyOrm(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public List<CustodyHandover> handovers(UUID orderId, int offset, int limit) {
        return entityManager.createQuery("""
                select handover from CustodyHandover handover
                join fetch handover.order join fetch handover.marshal left join fetch handover.collector
                left join fetch handover.location
                where handover.order.id = :orderId order by handover.occurredAt desc
                """, CustodyHandover.class)
                .setParameter("orderId", orderId).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<CustodyHandoverLine> lines(Collection<CustodyHandover> handovers) {
        if (handovers.isEmpty()) return List.of();
        return entityManager.createQuery("""
                select line from CustodyHandoverLine line join fetch line.orderLine
                join fetch line.item left join fetch line.assetInstance
                where line.handover in :handovers order by line.createdAt
                """, CustodyHandoverLine.class)
                .setParameter("handovers", handovers).getResultList();
    }

    public List<ReturnReconciliation> reconciliations(UUID orderId, int offset, int limit) {
        return entityManager.createQuery("""
                select reconciliation from ReturnReconciliation reconciliation
                join fetch reconciliation.order join fetch reconciliation.orderLine
                join fetch reconciliation.item left join fetch reconciliation.assetInstance
                join fetch reconciliation.recordedBy
                where reconciliation.order.id = :orderId order by reconciliation.createdAt desc
                """, ReturnReconciliation.class)
                .setParameter("orderId", orderId).setFirstResult(offset).setMaxResults(limit).getResultList();
    }
}
