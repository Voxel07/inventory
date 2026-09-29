package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.*;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class PlanningOrm {
    private final EntityManager em;
    public PlanningOrm(EntityManager em) { this.em = em; }
    public List<EventOccurrence> events() { return em.createQuery("from EventOccurrence e where e.status = 'planned' order by e.startDate", EventOccurrence.class).getResultList(); }
    public List<Item> items() { return em.createQuery("from Item i where i.active = true", Item.class).getResultList(); }
    public List<FactionOrderLine> lines() { return em.createQuery("from FactionOrderLine l where l.order.status in :states", FactionOrderLine.class).setParameter("states", List.of(DomainEnums.OrderStatus.draft, DomainEnums.OrderStatus.submitted, DomainEnums.OrderStatus.preparing, DomainEnums.OrderStatus.ready, DomainEnums.OrderStatus.picked_up, DomainEnums.OrderStatus.partially_returned, DomainEnums.OrderStatus.returned, DomainEnums.OrderStatus.closed)).getResultList(); }
    public List<GeneralOrder> generalOrders() { return em.createQuery("from GeneralOrder o where o.status in ('draft', 'submitted', 'preparing', 'ready', 'picked_up', 'partially_returned', 'returned', 'closed')", GeneralOrder.class).getResultList(); }
    public List<PurchaseOrderLine> incoming() { return em.createQuery("from PurchaseOrderLine l where l.purchaseOrder.status in :states", PurchaseOrderLine.class).setParameter("states", List.of(DomainEnums.PurchaseOrderStatus.ordered, DomainEnums.PurchaseOrderStatus.partially_received)).getResultList(); }
    public List<PlanningOverride> overrides() { return em.createQuery("from PlanningOverride p order by p.createdAt", PlanningOverride.class).getResultList(); }
    public <T> T find(Class<T> type, UUID id) { return em.find(type, id); }
    public void persist(Object value) { em.persist(value); }
}
