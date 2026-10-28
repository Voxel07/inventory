package org.ash.inventory.operations.internal.persistence;

import org.ash.inventory.operations.internal.model.ActionReminder;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.InventoryLot;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.model.LoanArrangement;
import org.ash.inventory.operations.internal.model.MaintenanceSchedule;
import org.ash.inventory.operations.internal.model.MemberRequest;
import org.ash.inventory.operations.internal.model.PurchaseOrder;
import org.ash.inventory.operations.internal.model.ReturnSubmission;
import org.ash.inventory.operations.internal.model.UserAccount;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.stream.Stream;

/** Persistence queries for the ActionInbox use cases. Business rules remain in the service. */
@ApplicationScoped
public class ActionInboxOrm extends EntityOrm {
    public List<ActionReminder> reminders(UserAccount user) {
        return entityManager.createQuery("from ActionReminder where user = :u", ActionReminder.class).setParameter("u", user).getResultList();
    }

    public Stream<ActionReminder> reminder(UserAccount user, String key) {
        return entityManager.createQuery("from ActionReminder where user = :u and actionKey = :key", ActionReminder.class).setParameter("u", user).setParameter("key", key).getResultStream();
    }

    private <T> List<T> scoped(String jpql, Class<T> type, java.util.UUID actor, String owner) {
        var query = entityManager.createQuery(jpql + (actor == null ? "" : " and " + owner + " = :actor"), type);
        if (actor != null) query.setParameter("actor", actor);
        return query.getResultList();
    }
    public List<InventoryOrder> readyFactionOrders(java.util.UUID actor) {
        return scoped("from InventoryOrder o join fetch o.createdBy where o.kind = faction and o.status = ready", InventoryOrder.class, actor, "o.createdBy.id");
    }
    public List<InventoryOrder> readyGeneralOrders(java.util.UUID actor) {
        return scoped("from InventoryOrder o join fetch o.createdBy left join fetch o.eventOccurrence where o.kind = general and o.status = ready", InventoryOrder.class, actor, "o.createdBy.id");
    }
    public List<ReturnSubmission> pendingReturns(java.util.UUID actor) {
        return scoped("from ReturnSubmission r join fetch r.item join fetch r.returnedFor where r.status = pending", ReturnSubmission.class, actor, "r.returnedFor.id");
    }
    public List<PurchaseOrder> incomingPurchases() {
        return entityManager.createQuery("from PurchaseOrder p join fetch p.vendor where p.status in (ordered, partially_received)", PurchaseOrder.class).getResultList();
    }
    public List<InventoryLot> availableLots(java.time.LocalDate deadline) {
        return entityManager.createQuery("from InventoryLot l join fetch l.item where l.status = available and l.expiryDate <= :deadline", InventoryLot.class)
                .setParameter("deadline", deadline).getResultList();
    }
    public List<MaintenanceSchedule> activeSchedules(java.util.UUID actor) {
        return scoped("from MaintenanceSchedule s join fetch s.item left join fetch s.assetInstance left join fetch s.responsiblePerson where s.active = true", MaintenanceSchedule.class, actor, "s.responsiblePerson.id");
    }
    public List<MemberRequest> openMemberRequests(java.util.UUID actor) {
        return scoped("from MemberRequest r join fetch r.item join fetch r.requester where r.status <> 'resolved'", MemberRequest.class, actor, "r.requester.id");
    }
    public List<LoanArrangement> loans() {
        return entityManager.createQuery("from LoanArrangement l join fetch l.commitment c join fetch c.item join fetch l.providerLocation where c.cancelled = false and l.returned <> c.quantity", LoanArrangement.class).getResultList();
    }
    public java.util.Map<java.util.UUID, EventOccurrence> events(java.util.Collection<java.util.UUID> ids) {
        if (ids.isEmpty()) return java.util.Map.of();
        return entityManager.createQuery("from EventOccurrence e where e.id in :ids", EventOccurrence.class).setParameter("ids", ids)
                .getResultStream().collect(java.util.stream.Collectors.toMap(e -> e.id, e -> e));
    }
}
