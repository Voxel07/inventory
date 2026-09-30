package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.*;
import java.util.List;
import java.util.Collection;
import java.time.LocalDate;
import java.util.UUID;

@ApplicationScoped
public class PlanningOrm {
    private final EntityManager em;
    public PlanningOrm(EntityManager em) { this.em = em; }
    public List<EventOccurrence> events(LocalDate through) {
        var query = em.createQuery("from EventOccurrence e where e.status = 'planned'"
                + (through == null ? "" : " and e.startDate <= :through") + " order by e.startDate, e.id", EventOccurrence.class);
        if (through != null) query.setParameter("through", through);
        return query.getResultList();
    }
    public List<Item> items() { return em.createQuery("from Item i where i.active = true", Item.class).getResultList(); }
    public List<FactionOrderLine> lines(Collection<UUID> eventIds) {
        if (eventIds.isEmpty()) return List.of();
        return em.createQuery("from FactionOrderLine l join fetch l.order o join fetch o.eventOccurrence join fetch l.item where o.eventOccurrence.id in :eventIds and o.status in :states", FactionOrderLine.class)
                .setParameter("eventIds", eventIds).setParameter("states", List.of(DomainEnums.OrderStatus.draft, DomainEnums.OrderStatus.submitted, DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.ready, DomainEnums.OrderStatus.picked_up, DomainEnums.OrderStatus.partially_returned, DomainEnums.OrderStatus.returned, DomainEnums.OrderStatus.closed)).getResultList();
    }
    public List<GeneralOrder> generalOrders(Collection<UUID> eventIds) {
        if (eventIds.isEmpty()) return List.of();
        return em.createQuery("from GeneralOrder o join fetch o.eventOccurrence where o.eventOccurrence.id in :eventIds and o.status in ('draft', 'submitted', 'preparing', 'ready', 'picked_up', 'partially_returned', 'returned', 'closed')", GeneralOrder.class)
                .setParameter("eventIds", eventIds).getResultList();
    }
    public List<PurchaseOrderLine> incoming(Collection<UUID> itemIds) {
        if (itemIds.isEmpty()) return List.of();
        // Late and undated supply still contributes to incomingAfterNeed; do not filter by selected event/date.
        return em.createQuery("from PurchaseOrderLine l join fetch l.purchaseOrder o join fetch l.item where l.item.id in :itemIds and l.orderedQuantity > l.receivedQuantity and o.status in :states", PurchaseOrderLine.class)
                .setParameter("itemIds", itemIds).setParameter("states", List.of(DomainEnums.PurchaseOrderStatus.ordered, DomainEnums.PurchaseOrderStatus.partially_received)).getResultList();
    }
    public List<PlanningOverride> overrides(Collection<UUID> eventIds, Collection<UUID> itemIds) {
        if (eventIds.isEmpty() || itemIds.isEmpty()) return List.of();
        return em.createQuery("""
                from PlanningOverride p join fetch p.event join fetch p.item join fetch p.actor
                where p.event.id in :eventIds and p.item.id in :itemIds and not exists (
                    select 1 from PlanningOverride newer where newer.event = p.event and newer.item = p.item
                    and (newer.createdAt > p.createdAt or (newer.createdAt = p.createdAt and newer.id > p.id)))
                order by p.event.id, p.item.id
                """, PlanningOverride.class).setParameter("eventIds", eventIds).setParameter("itemIds", itemIds).getResultList();
    }
    public <T> T find(Class<T> type, UUID id) { return em.find(type, id); }
    public void persist(Object value) { em.persist(value); }
}
