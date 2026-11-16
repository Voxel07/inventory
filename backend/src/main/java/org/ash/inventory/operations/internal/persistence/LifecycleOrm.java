package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.contract.dto.TaskFilters;
import org.ash.inventory.operations.internal.model.DomainEnums.RepairStatus;
import org.ash.inventory.operations.internal.model.MaintenanceSchedule;
import org.ash.inventory.operations.internal.model.RepairCase;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class LifecycleOrm extends EntityOrm {

    public List<MaintenanceSchedule> schedules(UUID itemId, UUID assetId, int offset, int limit) {
        var jpql = new StringBuilder("select schedule from MaintenanceSchedule schedule join fetch schedule.item left join fetch schedule.assetInstance left join fetch schedule.responsiblePerson where " + InventoryAccessOrm.visible("schedule.item.accessPolicy"));
        if (itemId != null) jpql.append(" and schedule.item.id = :itemId");
        if (assetId != null) jpql.append(" and schedule.assetInstance.id = :assetId");
        jpql.append(" order by schedule.active desc, schedule.nextDueAt nulls last");
        var query = entityManager.createQuery(jpql.toString(), MaintenanceSchedule.class);
        if (itemId != null) query.setParameter("itemId", itemId);
        if (assetId != null) query.setParameter("assetId", assetId);
        InventoryAccessOrm.bind(query, accessActor.current());
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<RepairCase> repairs(TaskFilters filters, int offset, int limit) {
        var predicates = new TaskQuery("select repair from RepairCase repair join fetch repair.damageReport report left join fetch report.item reportItem left join fetch report.assembly reportAssembly left join fetch repair.assetInstance asset left join fetch repair.repairOwner owner left join fetch repair.repairVendor vendor left join fetch repair.approvedBy where "
                + "(reportItem is null or " + InventoryAccessOrm.visible("reportItem.accessPolicy") + ")");
        predicates.status("repair.status", filters.status, RepairStatus.class, List.of(RepairStatus.returned_to_service, RepairStatus.written_off));
        predicates.search(filters.search, "reportItem.name", "reportItem.sku", "reportAssembly.name", "asset.assetCode", "report.description",
                "repair.notes", "repair.partsAndCostNotes", "owner.name", "vendor.name");
        if (filters.itemId != null) predicates.parameter("itemId", filters.itemId).where("reportItem.id = :itemId");
        if (filters.vendorId != null) predicates.parameter("vendorId", filters.vendorId).where("vendor.id = :vendorId");
        var query = predicates.bind(entityManager.createQuery(predicates.ordered("repair.safetyImpact desc, repair.createdAt desc, repair.id desc"), RepairCase.class));
        return InventoryAccessOrm.bind(query, accessActor.current()).setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public RepairCase repairForDamage(UUID damageId) {
        return entityManager.createQuery("from RepairCase repair where repair.damageReport.id = :damageId", RepairCase.class)
                .setParameter("damageId", damageId).getResultStream().findFirst().orElse(null);
    }
}
