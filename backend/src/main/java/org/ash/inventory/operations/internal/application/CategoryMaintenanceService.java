package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.CategoryMaintenancePolicy;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.MaintenanceSchedule;
import org.ash.inventory.operations.internal.persistence.CategoryMaintenanceOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
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
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public Policy save(Policy input) {
        actors.requireWarehouse();
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
        for (var item : items) apply(item);
        events.record("catalog.changed", "category-maintenance", policy == null ? UUID.randomUUID() : policy.id,
                actors.current().id, null, Map.of("resource", "category-maintenance", "category", name, "action", "updated"));
        return new Policy(name, input.intervalDays());
    }
    @Transactional
    public void apply(org.ash.inventory.operations.internal.model.Item item) {
        var template=orm.find(item.category);
        var schedules=orm.templates(item);
        for(var schedule:schedules) schedule.active=false;
        if(template==null || item.accessPolicy!=null) return;
        var scopes=new java.util.ArrayList<org.ash.inventory.operations.internal.model.AssetInstance>();
        if(item.trackingMode==org.ash.inventory.operations.internal.model.DomainEnums.TrackingMode.serialized) scopes.addAll(orm.assets(item));
        else scopes.add(null);
        for(var asset:scopes) {
            var schedule=schedules.stream().filter(s->item.category.equals(s.categoryTemplate) && java.util.Objects.equals(s.assetInstance,asset)).findFirst().orElse(null);
            if(schedule==null) {
                schedule=new org.ash.inventory.operations.internal.model.MaintenanceSchedule(); schedule.item=item; schedule.assetInstance=asset; schedule.categoryTemplate=item.category;
                schedule.maintenanceType=item.tracksRuntime?org.ash.inventory.operations.internal.model.DomainEnums.MaintenanceType.generator_service:org.ash.inventory.operations.internal.model.DomainEnums.MaintenanceType.dguv_v3;
                schedule.intervalType=org.ash.inventory.operations.internal.model.DomainEnums.MaintenanceIntervalType.date;
                schedule.nextDueAt=java.time.Instant.now().plus(java.time.Duration.ofDays(template.intervalDays));
                schedule.warningWindow=java.math.BigDecimal.valueOf(30); schedule.checkoutBlocking=true;
                schedule.intervalValue=java.math.BigDecimal.valueOf(template.intervalDays); orm.persistSchedule(schedule);
            }
            schedule.intervalValue=java.math.BigDecimal.valueOf(template.intervalDays); schedule.active=true;
        }
    }

}
