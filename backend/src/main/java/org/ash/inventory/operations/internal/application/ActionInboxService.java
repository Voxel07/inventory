package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.model.ActionReminder;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.persistence.ActionInboxOrm;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.BusinessTime;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.constraints.NotNull;
import java.time.*;
import java.util.*;

/** Live, recipient-scoped tasks. Completed work disappears without a stale notification queue. */
@ApplicationScoped
public class ActionInboxService {
    /** Lots whose expiry or best-before date falls within this window appear as warehouse tasks. */
    static final int LOT_EXPIRY_WARNING_DAYS = 30;
    @Inject org.ash.inventory.operations.internal.persistence.ActionInboxOrm orm;
    @Inject ActorService actors;
    @Inject CustodyBalanceService custody;
    @Inject MaintenanceEvaluationService maintenancePolicy;
    @Inject PrivacyProjectionService privacy;
    public record Action(String key, String kind, String title, String detail, LocalDate due, String path, Instant remindAt) {}
    /** Authorization references stay typed until filtering; task keys and URLs are display/navigation strings. */
    private record Candidate(Action action, Set<UUID> references) {}
    public record ReminderInput(@NotNull String key, Instant remindAt) {}
    @Transactional public List<Action> list() {
        var user = actors.current(); var reminders = new HashMap<String, Instant>();
        orm.reminders(user).forEach(r -> reminders.put(r.actionKey, r.remindAt));
        return live().stream().map(a -> new Action(a.key, a.kind, a.title, a.detail, a.due, a.path, reminders.get(a.key)))
                .sorted(Comparator.comparing(Action::due, Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(Action::key)).toList();
    }
    @Transactional
    public void remind(ReminderInput input) {
        var user = actors.current(); orm.lock(user);
        if (live().stream().noneMatch(a -> a.key.equals(input.key()))) throw ApiException.notFound("Action is no longer available");
        if (input.remindAt() != null && (input.remindAt().isBefore(Instant.now()) || input.remindAt().isAfter(Instant.now().plus(Duration.ofDays(30))))) throw ApiException.badRequest("Choose a reminder within the next 30 days");
        var r = orm.reminder(user, input.key()).findFirst().orElse(null);
        if (r == null) { r = new ActionReminder(); r.user = user; r.actionKey = input.key(); orm.persist(r); }
        r.remindAt = input.remindAt();
    }
    private List<Action> live() {
        var actor = actors.current(); var today = BusinessTime.today(); var out = new ArrayList<Candidate>();
        // Tenants have no organization work items; their notices arrive as notifications.
        if (!ActorService.seesOrganization(actor)) return List.of();
        boolean warehouse = actor.role.atLeast(DomainEnums.UserRole.warehouse_crew);
        boolean maintenance = warehouse;
        for (var o : orm.readyFactionOrders(warehouse ? null : actor.id))
            if (warehouse || o.createdBy.id.equals(actor.id)) add(out, "pickup:" + o.id, "pickup", o.orderCode, o.collectorName, o.requestedPickupDate, "/orders/faction/" + o.id, o.id);
        for (var o : orm.readyGeneralOrders(warehouse ? null : actor.id))
            if (warehouse || o.createdBy.id.equals(actor.id)) add(out, "pickup:" + o.id, "pickup", o.name, o.purpose, o.eventOccurrence == null ? null : o.eventOccurrence.startDate, "/orders?tab=general", o.id);
        var balances = custody.list(!warehouse);
        var events = orm.events(balances.stream().map(CustodyBalanceService.Balance::eventOccurrenceId).filter(Objects::nonNull).distinct().toList());
        for (var b : balances) {
            var event = b.eventOccurrenceId() == null ? null : events.get(b.eventOccurrenceId());
            if (event != null && event.endDate.isBefore(today)) add(out, "return:" + b.key(), "overdue_return", b.name(), b.person() + " · " + b.checkedOut(), event.endDate, warehouse ? "/checked-out" : equipment("custody", b.key()), b.itemId(), b.orderId(), b.assetInstanceId());
        }
        for (var r : orm.pendingReturns(warehouse ? null : actor.id))
            if (warehouse || r.returnedFor.id.equals(actor.id)) add(out, "ack:" + r.id, "acknowledgement", r.item.name, r.quantity + " · " + r.returnedFor.name, BusinessTime.date(r.createdAt), warehouse ? "/returns" : equipment("returns", r.id.toString()), r.id, r.item.id);
        if (warehouse)
            for (var p : orm.incomingPurchases())
                add(out, "receipt:" + p.id, "receipt", p.orderNumber, p.vendor.name, p.expectedDeliveryDate, "/operations?tab=receipts", p.id);
        if (warehouse)
            for (var l : orm.availableLots(today.plusDays(LOT_EXPIRY_WARNING_DAYS))) {
                var due = l.expiryDate;
                if (due != null && !due.isAfter(today.plusDays(LOT_EXPIRY_WARNING_DAYS))) add(out, "lot:" + l.id, "expiring_lot", l.item.name, l.lotNumber, due, "/operations?tab=lots", l.id, l.item.id);
            }
        var schedules = orm.activeSchedules(maintenance ? null : actor.id);
        var statuses = maintenancePolicy.statuses(schedules, Instant.now());
        for (var s : schedules) {
            if (!maintenance && (s.responsiblePerson == null || !s.responsiblePerson.id.equals(actor.id))) continue;
            LocalDate due = s.nextDueAt == null ? null : BusinessTime.date(s.nextDueAt);
            if (statuses.get(s.id) != MaintenancePolicy.Status.healthy)
                add(out, "maintenance:" + s.id, "maintenance", s.item.name, s.maintenanceType.name() + (s.assetInstance == null ? "" : " · " + s.assetInstance.assetCode), due, maintenance ? "/operations?tab=schedules"
                        : s.assetInstance == null ? "/items/" + s.item.id : "/items/" + s.item.id + "/assets/" + s.assetInstance.id, s.id, s.item.id);
        }
        for (var r : orm.openMemberRequests(warehouse ? null : actor.id))
            if (warehouse || r.requester.id.equals(actor.id)) add(out, "request:" + r.id, r.kind, r.item.name, r.requester.name + " · " + r.notes, null, equipment("requests", r.id.toString()), r.id, r.item.id);
        if (warehouse) for (var l : orm.loans()) {
            var c = l.commitment; if (c.cancelled || l.returned == c.quantity) continue;
            add(out, "loan:" + l.id, l.collected < c.quantity ? "collection" : "provider_return", l.provider + " · " + c.item.name,
                    (l.collected - l.returned) + " / " + c.quantity, l.collected < c.quantity ? c.availableFrom : c.returnDue, "/operations?tab=loans", l.id, c.item.id, l.providerLocation.id);
        }
        var references = out.stream().flatMap(candidate -> candidate.references().stream())
                .collect(java.util.stream.Collectors.toSet());
        var denied = privacy.deniedAmong(references);
        return out.stream().filter(candidate -> Collections.disjoint(candidate.references(), denied))
                .map(Candidate::action).toList();
    }
    /** Deep link into the personal equipment overview: section plus the task row to focus. */
    private static String equipment(String section, String focus) {
        return "/?equipment=" + section + "&focus=" + java.net.URLEncoder.encode(focus, java.nio.charset.StandardCharsets.UTF_8);
    }
    private void add(List<Candidate> out, String key, String kind, String title, String detail, LocalDate due, String path, UUID... references) {
        var ids = Arrays.stream(references).filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
        out.add(new Candidate(new Action(key, kind, title, detail, due, path, null), ids));
    }
}
