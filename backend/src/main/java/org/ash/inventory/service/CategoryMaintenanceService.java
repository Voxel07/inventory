package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.CategoryMaintenancePolicy;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.orm.CategoryMaintenanceOrm;
import org.ash.inventory.resource.ApiException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class CategoryMaintenanceService {
    private final CategoryMaintenanceOrm orm;
    private final ActorService actors;
    private final DomainEventService events;

    public CategoryMaintenanceService(CategoryMaintenanceOrm orm, ActorService actors, DomainEventService events) {
        this.orm = orm;
        this.actors = actors;
        this.events = events;
    }

    public record Policy(String category, int intervalDays) {}

    @Transactional
    public List<Policy> list() {
        actors.current();
        return orm.list().stream().map(p -> new Policy(p.category, p.intervalDays)).toList();
    }

    @Transactional
    @org.ash.inventory.helper.security.PrivateInventoryCommand
    public Policy save(Policy input) {
        actors.requireManager();
        var name = input.category() == null ? "" : input.category().trim();
        if (name.isEmpty() || name.length() > 255) throw ApiException.badRequest("Invalid category");
        if (input.intervalDays() < 0) throw ApiException.badRequest("Interval must not be negative");
        var policy = orm.find(name);
        if (input.intervalDays() == 0) {
            if (policy != null) orm.remove(policy);
        } else if (policy == null) {
            policy = new CategoryMaintenancePolicy();
            policy.category = name;
            policy.intervalDays = input.intervalDays();
            orm.persist(policy);
        } else {
            policy.intervalDays = input.intervalDays();
        }
        var items = orm.items(name);
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
                actors.current().id, null, Map.of("resource", "category-maintenance", "category", name));
        return new Policy(name, input.intervalDays());
    }
}
