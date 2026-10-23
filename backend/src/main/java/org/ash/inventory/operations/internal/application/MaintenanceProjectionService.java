package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.AssetInstance;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.MaintenanceSchedule;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.platform.api.BusinessTime;

import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import java.time.*;
import java.util.*;
/** Batch-loaded summaries derived exclusively from active schedules and safety flags. */
@RequestScoped
public class MaintenanceProjectionService {
    @Inject EntityManager em;
    @Inject MaintenanceEvaluationService evaluation;
    private final Map<UUID,List<MaintenanceSchedule>> schedules=new HashMap<>();
    private final Map<UUID,MaintenancePolicy.Status> statuses=new HashMap<>();
    public void prepare(Collection<Item> items) {
        var ids=items.stream().map(i->i.id).filter(Objects::nonNull).filter(id->!schedules.containsKey(id)).distinct().toList();
        if(ids.isEmpty())return;
        ids.forEach(id->schedules.put(id,new ArrayList<>()));
        var rows=em.createQuery("from MaintenanceSchedule s left join fetch s.assetInstance a where s.active=true and s.item.id in :ids and (a is null or a.active=true)",MaintenanceSchedule.class).setParameter("ids",ids).getResultList();
        rows.forEach(s->schedules.get(s.item.id).add(s)); statuses.putAll(evaluation.statuses(rows,Instant.now()));
    }
    private List<MaintenanceSchedule> applicable(Item item,AssetInstance asset) {
        prepare(List.of(item)); return schedules.getOrDefault(item.id,List.of()).stream()
                .filter(s->asset==null || s.assetInstance==null || asset.id.equals(s.assetInstance.id)).toList();
    }
    public LocalDate due(Item item,AssetInstance asset) {
        return applicable(item,asset).stream().filter(s->s.intervalType==DomainEnums.MaintenanceIntervalType.date)
                .map(s->s.nextDueAt).filter(Objects::nonNull).min(Comparator.naturalOrder()).map(org.ash.inventory.platform.api.BusinessTime::date).orElse(null);
    }
    /** Only schedules that currently prevent checkout; warning-only and non-blocking plans are excluded. */
    public List<ApiResponses.MaintenanceBlockResponse> blocking(Item item) {
        return applicable(item, null).stream()
                .filter(s -> s.checkoutBlocking && MaintenancePolicy.blocksCheckout(statuses.get(s.id)))
                .sorted(Comparator.comparing((MaintenanceSchedule s) -> s.nextDueAt, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(s -> s.id))
                .map(s -> new ApiResponses.MaintenanceBlockResponse(s.id, s.maintenanceType.name(),
                        s.assetInstance == null ? null : s.assetInstance.assetCode,
                        statuses.get(s.id).name(), s.intervalType.name(), s.nextDueAt, s.nextDueValue))
                .toList();
    }
    public String status(Item item,AssetInstance asset) {
        if(item.outOfService || asset!=null && asset.outOfService)return "in_service";
        var values=applicable(item,asset).stream().map(s->statuses.get(s.id)).toList();
        if(values.contains(MaintenancePolicy.Status.due)||values.contains(MaintenancePolicy.Status.unknown))return "overdue";
        return values.contains(MaintenancePolicy.Status.warning)?"due_soon":"certified";
    }
}
