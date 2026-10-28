package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.StockTransaction;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.util.*;

/** Internal provenance reads; callers already hold and authorize the item lock. */
@ApplicationScoped
public class IssueAllocationOrm {
    @Inject EntityManager em;

    public List<StockTransaction> issues(StockTransaction returned) {
        var sql = new StringBuilder("from StockTransaction t where t.item = :item and t.type = checkout and t.quantity > 0"
                + " and t.reverses is null and not exists (select r.id from StockTransaction r where r.reverses = t)");
        boolean restock = returned.order == null && "restock".equals(returned.relatedEntityType);
        if (returned.order != null) sql.append(" and t.order = :order");
        else if (restock) sql.append(" and t.id = :checkout");
        else sql.append(" and t.order is null and t.relatedEntityType is null and t.user = :user"
                + (returned.eventOccurrence == null ? " and t.eventOccurrence is null" : " and t.eventOccurrence = :event"));
        var query = em.createQuery(sql + " order by t.createdAt, t.id", StockTransaction.class).setParameter("item", returned.item);
        if (returned.order != null) query.setParameter("order", returned.order);
        else if (restock) query.setParameter("checkout", returned.relatedEntityId);
        else {
            query.setParameter("user", returned.user);
            if (returned.eventOccurrence != null) query.setParameter("event", returned.eventOccurrence);
        }
        return query.getResultList();
    }

    public Map<String, Integer> settled(StockTransaction returned) {
        var query = em.createQuery("from StockTransaction t where t.item = :item and t.type in (checkin, written_off)"
                + (returned.order == null ? " and t.order is null" : " and t.order = :order"), StockTransaction.class)
                .setParameter("item", returned.item);
        if (returned.order != null) query.setParameter("order", returned.order);
        var result = new HashMap<String, Integer>();
        for (var tx : query.getResultList()) tx.issueQuantities.forEach((key, quantity) -> result.merge(key, quantity, Math::addExact));
        return result;
    }

    public InventoryPosition position(UUID id) { return em.find(InventoryPosition.class, id); }
}
