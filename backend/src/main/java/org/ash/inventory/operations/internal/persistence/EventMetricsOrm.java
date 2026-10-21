package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.OrderLine;
import org.ash.inventory.operations.internal.model.StockTransaction;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.Collection;
import java.util.UUID;

@ApplicationScoped
public class EventMetricsOrm extends EntityOrm {
    public List<OrderLine> orderLines(Collection<UUID> eventIds) {
        if (eventIds.isEmpty()) return List.of();
        return entityManager.createQuery("from OrderLine line join fetch line.order o join fetch line.item where o.eventOccurrence.id in :ids and o.status <> :cancelled", OrderLine.class)
                .setParameter("ids", eventIds).setParameter("cancelled", DomainEnums.OrderStatus.cancelled).getResultList();
    }

    public List<StockTransaction> directMovements(Collection<UUID> eventIds) {
        if (eventIds.isEmpty()) return List.of();
        return entityManager.createQuery("from StockTransaction tx join fetch tx.item where tx.eventOccurrence.id in :ids and tx.order is null and (tx.relatedEntityType is null or tx.relatedEntityType = 'restock')", StockTransaction.class)
                .setParameter("ids", eventIds).getResultList();
    }

    public List<Item> items(Collection<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return entityManager.createQuery("from Item i where i.id in :ids", Item.class).setParameter("ids", ids).getResultList();
    }
}
