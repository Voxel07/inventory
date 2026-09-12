package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.ash.inventory.model.MaintenanceSchedule;
import org.ash.inventory.model.RepairCase;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class LifecycleOrm {
    private final EntityManager entityManager;
    public LifecycleOrm(EntityManager entityManager) { this.entityManager = entityManager; }
    public void persist(Object value) { entityManager.persist(value); }
    public <T> T find(Class<T> type, UUID id) { return entityManager.find(type, id); }
    public <T> T locked(Class<T> type, UUID id) { return entityManager.find(type, id, LockModeType.PESSIMISTIC_WRITE); }

    public List<MaintenanceSchedule> schedules(UUID itemId, UUID assetId, int offset, int limit) {
        var jpql = new StringBuilder("select schedule from MaintenanceSchedule schedule join fetch schedule.item left join fetch schedule.assetInstance left join fetch schedule.responsiblePerson where 1=1");
        if (itemId != null) jpql.append(" and schedule.item.id = :itemId");
        if (assetId != null) jpql.append(" and schedule.assetInstance.id = :assetId");
        jpql.append(" order by schedule.active desc, schedule.nextDueAt nulls last");
        var query = entityManager.createQuery(jpql.toString(), MaintenanceSchedule.class);
        if (itemId != null) query.setParameter("itemId", itemId);
        if (assetId != null) query.setParameter("assetId", assetId);
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public List<RepairCase> repairs(String status, int offset, int limit) {
        var jpql = status == null || status.isBlank()
                ? "select repair from RepairCase repair join fetch repair.damageReport report left join fetch repair.assetInstance left join fetch repair.repairOwner left join fetch repair.repairVendor left join fetch repair.approvedBy order by repair.createdAt desc"
                : "select repair from RepairCase repair join fetch repair.damageReport report left join fetch repair.assetInstance left join fetch repair.repairOwner left join fetch repair.repairVendor left join fetch repair.approvedBy where repair.status = :status order by repair.createdAt desc";
        var query = entityManager.createQuery(jpql, RepairCase.class);
        if (status != null && !status.isBlank()) query.setParameter("status", org.ash.inventory.model.DomainEnums.RepairStatus.valueOf(status));
        return query.setFirstResult(offset).setMaxResults(limit).getResultList();
    }

    public RepairCase repairForDamage(UUID damageId) {
        return entityManager.createQuery("from RepairCase repair where repair.damageReport.id = :damageId", RepairCase.class)
                .setParameter("damageId", damageId).getResultStream().findFirst().orElse(null);
    }
}
