package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.*;
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

    public List<FactionOrder> readyFactionOrders() {
        return entityManager.createQuery("from FactionOrder where status = :s", FactionOrder.class).setParameter("s", DomainEnums.OrderStatus.ready).getResultList();
    }

    public List<GeneralOrder> readyGeneralOrders() {
        return entityManager.createQuery("from GeneralOrder where status = 'ready'", GeneralOrder.class).getResultList();
    }

    public List<ReturnSubmission> pendingReturns() {
        return entityManager.createQuery("from ReturnSubmission where status = :s", ReturnSubmission.class).setParameter("s", DomainEnums.ReturnSubmissionStatus.pending).getResultList();
    }

    public List<PurchaseOrder> incomingPurchases() {
        return entityManager.createQuery("from PurchaseOrder where status in :states", PurchaseOrder.class).setParameter("states", List.of(DomainEnums.PurchaseOrderStatus.ordered, DomainEnums.PurchaseOrderStatus.partially_received)).getResultList();
    }

    public List<InventoryLot> availableLots() {
        return entityManager.createQuery("from InventoryLot where status = :s", InventoryLot.class).setParameter("s", DomainEnums.LotStatus.available).getResultList();
    }

    public List<MaintenanceSchedule> activeSchedules() {
        return entityManager.createQuery("from MaintenanceSchedule where active = true", MaintenanceSchedule.class).getResultList();
    }

    public List<MemberRequest> openMemberRequests() {
        return entityManager.createQuery("from MemberRequest where status <> 'resolved'", MemberRequest.class).getResultList();
    }

    public List<LoanArrangement> loans() {
        return entityManager.createQuery("from LoanArrangement", LoanArrangement.class).getResultList();
    }
}
