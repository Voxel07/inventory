package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
import java.util.List;

@ApplicationScoped
public class EventMetricsOrm extends EntityOrm {
    public List<FactionOrderLine> factionLines(EventOccurrence event) {
        return entityManager.createQuery("from FactionOrderLine line where line.order.eventOccurrence = :event and line.order.status <> :cancelled", FactionOrderLine.class)
                .setParameter("event", event).setParameter("cancelled", DomainEnums.OrderStatus.cancelled).getResultList();
    }

    public List<GeneralOrder> generalOrders(EventOccurrence event) {
        return entityManager.createQuery("from GeneralOrder orderEntry where orderEntry.eventOccurrence = :event and orderEntry.status <> 'cancelled'", GeneralOrder.class)
                .setParameter("event", event).getResultList();
    }

    public List<StockTransaction> directMovements(EventOccurrence event) {
        return entityManager.createQuery("from StockTransaction tx where tx.eventOccurrence = :event and tx.factionOrder is null and tx.relatedEntityType is null", StockTransaction.class)
                .setParameter("event", event).getResultList();
    }
}
