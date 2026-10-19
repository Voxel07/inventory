package org.ash.inventory.service;

import org.ash.inventory.helper.BusinessTime;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.CategoryMaintenancePolicy;
import org.ash.inventory.orm.CategoryMaintenanceOrm;
import org.ash.inventory.resource.ApiException;
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
                actors.current().id, null, Map.of("resource", "category-maintenance", "category", name));
        return new Policy(name, input.intervalDays());
    }
    @Transactional
    public void apply(org.ash.inventory.model.Item item) {
        var template=orm.find(item.category);
        var schedules=orm.templates(item);
        for(var schedule:schedules) schedule.active=false;
        if(template==null || item.accessPolicy!=null) return;
        var scopes=new java.util.ArrayList<org.ash.inventory.model.AssetInstance>();
        if(item.trackingMode==org.ash.inventory.model.DomainEnums.TrackingMode.serialized) scopes.addAll(orm.assets(item));
        else scopes.add(null);
        for(var asset:scopes) {
            var schedule=schedules.stream().filter(s->item.category.equals(s.categoryTemplate) && java.util.Objects.equals(s.assetInstance,asset)).findFirst().orElse(null);
            if(schedule==null) {
                schedule=new org.ash.inventory.model.MaintenanceSchedule(); schedule.item=item; schedule.assetInstance=asset; schedule.categoryTemplate=item.category;
                schedule.maintenanceType=item.tracksRuntime?org.ash.inventory.model.DomainEnums.MaintenanceType.generator_service:org.ash.inventory.model.DomainEnums.MaintenanceType.dguv_v3;
                schedule.intervalType=org.ash.inventory.model.DomainEnums.MaintenanceIntervalType.date;
                schedule.nextDueAt=java.time.Instant.now().plus(java.time.Duration.ofDays(template.intervalDays));
                schedule.warningWindow=java.math.BigDecimal.valueOf(30); schedule.checkoutBlocking=true;
                schedule.intervalValue=java.math.BigDecimal.valueOf(template.intervalDays); orm.persistSchedule(schedule);
            }
            schedule.intervalValue=java.math.BigDecimal.valueOf(template.intervalDays); schedule.active=true;
        }
    }

}
