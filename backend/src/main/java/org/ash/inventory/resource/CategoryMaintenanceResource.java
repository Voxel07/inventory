package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.CategoryMaintenancePolicy;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.service.DomainEventService;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Path("/api/category-maintenance")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class CategoryMaintenanceResource {
    @Inject EntityManager em;
    @Inject ActorService actor;
    @Inject DomainEventService events;

    public record Policy(String category, int intervalDays) {}

    @GET
    public List<Policy> list() {
        actor.current();
        return em.createQuery("select p from CategoryMaintenancePolicy p order by p.category", CategoryMaintenancePolicy.class)
                .getResultList().stream().map(p -> new Policy(p.category, p.intervalDays)).toList();
    }

    @PUT @Transactional
    public Policy save(Policy input) {
        actor.requireManager();
        var name = input.category() == null ? "" : input.category().trim();
        if (name.isEmpty() || name.length() > 255) throw ApiException.badRequest("Invalid category");
        if (input.intervalDays() < 0) throw ApiException.badRequest("Interval must not be negative");
        var matches = em.createQuery("select p from CategoryMaintenancePolicy p where lower(p.category) = lower(:name)", CategoryMaintenancePolicy.class)
                .setParameter("name", name).getResultList();
        var policy = matches.isEmpty() ? null : matches.getFirst();
        if (input.intervalDays() == 0) {
            if (policy != null) em.remove(policy);
        } else if (policy == null) {
            policy = new CategoryMaintenancePolicy();
            policy.category = name;
            policy.intervalDays = input.intervalDays();
            em.persist(policy);
        } else {
            policy.intervalDays = input.intervalDays();
        }
        var items = em.createQuery("select i from Item i where lower(i.category) = lower(:name)", Item.class)
                .setParameter("name", name).getResultList();
        for (var item : items) {
            item.maintenanceIntervalDays = input.intervalDays() == 0 ? null : input.intervalDays();
            if (input.intervalDays() == 0) {
                item.nextMaintenanceDue = null;
                if (item.maintenanceStatus == DomainEnums.MaintenanceStatus.overdue
                        || item.maintenanceStatus == DomainEnums.MaintenanceStatus.due_soon) {
                    item.maintenanceStatus = DomainEnums.MaintenanceStatus.certified;
                }
            }
            else if (item.nextMaintenanceDue == null) item.nextMaintenanceDue = LocalDate.now().plusDays(input.intervalDays());
        }
        events.record("catalog.changed", "category-maintenance", policy == null ? UUID.randomUUID() : policy.id,
                actor.current().id, null, Map.of("resource", "category-maintenance", "category", name));
        return new Policy(name, input.intervalDays());
    }
}
