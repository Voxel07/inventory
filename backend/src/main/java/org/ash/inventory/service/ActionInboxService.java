package org.ash.inventory.service;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.*;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.NotNull;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.resource.ApiException;
import java.time.*;
import java.util.*;

/** Live, recipient-scoped tasks. Completed work disappears without a stale notification queue. */
@ApplicationScoped
public class ActionInboxService {
    @Inject EntityManager em;
    @Inject ActorService actors;
    @Inject CustodyBalanceService custody;
    @Inject org.ash.inventory.orm.OperationsOrm operations;
    public record Action(String key, String kind, String title, String detail, LocalDate due, String path, Instant remindAt) {}
    public record ReminderInput(@NotNull String key, Instant remindAt) {}
    @Transactional public List<Action> list() {
        var user = actors.current(); var reminders = new HashMap<String, Instant>();
        em.createQuery("from ActionReminder where user = :u", ActionReminder.class).setParameter("u", user).getResultList().forEach(r -> reminders.put(r.actionKey, r.remindAt));
        return live().stream().map(a -> new Action(a.key, a.kind, a.title, a.detail, a.due, a.path, reminders.get(a.key)))
                .sorted(Comparator.comparing(Action::due, Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(Action::key)).toList();
    }
    @Transactional public void remind(ReminderInput input) {
        var user = actors.current(); em.lock(user, LockModeType.PESSIMISTIC_WRITE);
        if (live().stream().noneMatch(a -> a.key.equals(input.key()))) throw ApiException.notFound("Action is no longer available");
        if (input.remindAt() != null && (input.remindAt().isBefore(Instant.now()) || input.remindAt().isAfter(Instant.now().plus(Duration.ofDays(30))))) throw ApiException.badRequest("Choose a reminder within the next 30 days");
        var r = em.createQuery("from ActionReminder where user = :u and actionKey = :key", ActionReminder.class).setParameter("u", user).setParameter("key", input.key()).getResultStream().findFirst().orElse(null);
        if (r == null) { r = new ActionReminder(); r.user = user; r.actionKey = input.key(); em.persist(r); }
        r.remindAt = input.remindAt();
    }
    private List<Action> live() {
        var actor = actors.current(); var today = LocalDate.now(); var out = new ArrayList<Action>();
        boolean warehouse = Set.of(DomainEnums.UserRole.hq_admin, DomainEnums.UserRole.warehouse_crew).contains(actor.role);
        boolean maintenance = actor.role == DomainEnums.UserRole.hq_admin || actor.role == DomainEnums.UserRole.maintenance_crew;
        for (var o : em.createQuery("from FactionOrder where status = :s", FactionOrder.class).setParameter("s", DomainEnums.OrderStatus.ready).getResultList())
            if (warehouse || o.createdBy.id.equals(actor.id)) add(out, "pickup:" + o.id, "pickup", o.orderCode, o.collectorName, o.requestedPickupDate, o.createdBy.id.equals(actor.id) || warehouse ? "/orders/faction/" + o.id : "/contributor");
        for (var o : em.createQuery("from GeneralOrder where status = 'ready'", GeneralOrder.class).getResultList())
            if (warehouse || o.createdBy.id.equals(actor.id)) add(out, "pickup:" + o.id, "pickup", o.name, o.purpose, o.eventOccurrence == null ? null : o.eventOccurrence.startDate, "/orders?tab=general");
        for (var b : custody.list(!warehouse)) {
            var event = b.eventOccurrenceId() == null ? null : em.find(EventOccurrence.class, b.eventOccurrenceId());
            if (event != null && event.endDate.isBefore(today)) add(out, "return:" + b.key(), "overdue_return", b.name(), b.person() + " · " + b.checkedOut(), event.endDate, warehouse ? "/checked-out" : "/contributor");
        }
        for (var r : em.createQuery("from ReturnSubmission where status = :s", ReturnSubmission.class).setParameter("s", DomainEnums.ReturnSubmissionStatus.pending).getResultList())
            if (warehouse || r.returnedFor.id.equals(actor.id)) add(out, "ack:" + r.id, "acknowledgement", r.item.name, r.quantity + " · " + r.returnedFor.name, r.createdAt.atZone(ZoneId.systemDefault()).toLocalDate(), warehouse ? "/returns" : "/contributor");
        if (warehouse || actor.role == DomainEnums.UserRole.event_planner)
            for (var p : em.createQuery("from PurchaseOrder where status in :states", PurchaseOrder.class).setParameter("states", List.of(DomainEnums.PurchaseOrderStatus.ordered, DomainEnums.PurchaseOrderStatus.partially_received)).getResultList())
                add(out, "receipt:" + p.id, "receipt", p.orderNumber, p.vendor.name, p.expectedDeliveryDate, "/operations?tab=" + (warehouse ? "receipts" : "purchases"));
        if (warehouse)
            for (var l : em.createQuery("from InventoryLot where status = :s", InventoryLot.class).setParameter("s", DomainEnums.LotStatus.available).getResultList()) {
                var due = l.expiryDate == null ? l.bestBeforeDate : l.bestBeforeDate == null || l.expiryDate.isBefore(l.bestBeforeDate) ? l.expiryDate : l.bestBeforeDate;
                if (due != null && !due.isAfter(today.plusDays(30))) add(out, "lot:" + l.id, "expiring_lot", l.item.name, l.lotNumber, due, "/operations?tab=lots");
            }
        for (var s : em.createQuery("from MaintenanceSchedule where active = true", MaintenanceSchedule.class).getResultList()) {
            if (!maintenance && (s.responsiblePerson == null || !s.responsiblePerson.id.equals(actor.id))) continue;
            LocalDate due = s.nextDueAt == null ? null : s.nextDueAt.atZone(ZoneId.systemDefault()).toLocalDate();
            boolean needed = due != null && !due.isAfter(today.plusDays(s.warningWindow.longValue()));
            if (s.intervalType != DomainEnums.MaintenanceIntervalType.date && s.nextDueValue != null) {
                var meter = s.intervalType == DomainEnums.MaintenanceIntervalType.operating_hours
                        ? (s.assetInstance == null ? s.item.currentOperatingHours : s.assetInstance.operatingHours)
                        : java.math.BigDecimal.valueOf(operations.checkoutCount(s.item, s.assetInstance));
                needed = meter.add(s.warningWindow).compareTo(s.nextDueValue) >= 0;
            }
            if (needed) add(out, "maintenance:" + s.id, "maintenance", s.item.name, s.maintenanceType.name() + (s.assetInstance == null ? "" : " · " + s.assetInstance.assetCode), due, maintenance ? "/operations?tab=schedules" : "/contributor");
        }
        for (var r : em.createQuery("from MemberRequest where status <> 'resolved'", MemberRequest.class).getResultList())
            if (warehouse || r.requester.id.equals(actor.id)) add(out, "request:" + r.id, r.kind, r.item.name, r.requester.name + " · " + r.notes, null, "/contributor");
        if (warehouse) for (var l : em.createQuery("from LoanArrangement", LoanArrangement.class).getResultList()) {
            var c = l.commitment; if (c.cancelled || l.returned == c.quantity) continue;
            add(out, "loan:" + l.id, l.collected < c.quantity ? "collection" : "provider_return", l.provider + " · " + c.item.name,
                    (l.collected - l.returned) + " / " + c.quantity, l.collected < c.quantity ? c.availableFrom : c.returnDue, "/operations?tab=loans");
        }
        return out;
    }
    private void add(List<Action> out, String key, String kind, String title, String detail, LocalDate due, String path) { out.add(new Action(key, kind, title, detail, due, path, null)); }
}
