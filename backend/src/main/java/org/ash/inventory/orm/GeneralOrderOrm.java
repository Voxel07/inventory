package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import org.ash.inventory.model.GeneralOrder;
import org.ash.inventory.model.GeneralOrderHistory;

import java.util.List;
import java.util.UUID;
import jakarta.persistence.LockModeType;

@ApplicationScoped
public class GeneralOrderOrm {
    @jakarta.inject.Inject InventoryAccessOrm privacyScopes;
    @jakarta.inject.Inject protected org.ash.inventory.helper.security.ActorService accessActor;
    private final EntityManager entityManager;

    public GeneralOrderOrm(EntityManager entityManager) { this.entityManager = entityManager; }

    /**
     * Server-side list filters. {@code eventId} selects one event; otherwise {@code eventType} selects orders of
     * that event type and orders without an event. {@code search} matches name and purpose.
     */
    public record Filter(java.util.Collection<String> statuses, UUID eventId, String eventType, String search) {}

    public List<GeneralOrder> orders(org.ash.inventory.model.UserAccount actor, Filter filter, int offset, int limit) {
        var denied = privacyScopes.deniedReferences(actor);
        // Organization members read all general orders; changes are limited to owners and warehouse.
        var jpql = new StringBuilder("from GeneralOrder o join fetch o.createdBy left join fetch o.eventOccurrence event where 1=1");
        if (!filter.statuses().isEmpty()) jpql.append(" and o.status in :statuses");
        if (filter.eventId() != null) jpql.append(" and event.id = :eventId");
        else if (filter.eventType() != null && !filter.eventType().isBlank()) jpql.append(" and (event is null or event.eventType = :eventType)");
        boolean searching = filter.search() != null && !filter.search().isBlank();
        if (searching) jpql.append(" and (lower(o.name) like :search or lower(o.purpose) like :search)");
        var query = entityManager.createQuery(jpql + InventoryAccessOrm.excluding("o", denied) + " order by o.createdAt desc", GeneralOrder.class);
        if (!filter.statuses().isEmpty()) query.setParameter("statuses", filter.statuses());
        if (filter.eventId() != null) query.setParameter("eventId", filter.eventId());
        else if (filter.eventType() != null && !filter.eventType().isBlank()) query.setParameter("eventType", filter.eventType());
        if (searching) query.setParameter("search", "%" + filter.search().trim().toLowerCase(java.util.Locale.ROOT) + "%");
        return InventoryAccessOrm.bindDenied(query, denied).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public GeneralOrderHistory commandHistory(UUID key) {
        return entityManager.createQuery("from GeneralOrderHistory h where h.commandId = :key", GeneralOrderHistory.class)
                .setParameter("key", key).getResultStream().findFirst().orElse(null);
    }

    public List<GeneralOrderHistory> history(GeneralOrder order) {
        return entityManager.createQuery("from GeneralOrderHistory h join fetch h.actor where h.order = :order order by h.occurredAt, h.id", GeneralOrderHistory.class)
                .setParameter("order", order).getResultList();
    }

    public <T> T find(Class<T> type, UUID id) { return accessActor.protect(entityManager.find(type, id), false); }
    public <T> T findLocked(Class<T> type, UUID id) { return accessActor.protect(entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE), true); }
    public void flush() { entityManager.flush(); }
    public void persist(Object value) { entityManager.persist(value); }
    public GeneralOrder locked(UUID id) { return entityManager.find(GeneralOrder.class, id, LockModeType.PESSIMISTIC_WRITE); }
}
