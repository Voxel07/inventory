package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import org.ash.inventory.helper.Inputs;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.EventAttendee;
import org.ash.inventory.model.EventAttendeeRole;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.EventPerson;
import org.ash.inventory.model.EventTimelineEntry;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.EventLogisticsOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.dto.EventLogisticsDtos.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@ApplicationScoped
@Transactional
public class EventLogisticsService {
    private final EventLogisticsOrm orm;
    private final ActorService actors;
    private final DomainEventService events;

    public EventLogisticsService(EventLogisticsOrm orm, ActorService actors, DomainEventService events) {
        this.orm = orm;
        this.actors = actors;
        this.events = events;
    }

    public List<AttendeeResponse> attendees(UUID eventId) {
        requireRead();
        var event = orm.require(EventOccurrence.class, eventId, "Event");
        var factions = orm.factions(event.eventType);
        return orm.attendees(eventId).stream().map(attendee -> AttendeeResponse.from(attendee, factions)).toList();
    }

    public List<PersonResponse> people() {
        requireRead();
        var counts = orm.attendanceCounts();
        return orm.people().stream().map(person -> {
            var summary = PersonSummary.from(person);
            return new PersonResponse(person.id, person.name, summary.userId(), summary.userName(), counts.getOrDefault(person.id, 0L));
        }).toList();
    }

    /** Accounts a person can be linked to; only planners link, so only they see the directory. */
    public List<AccountOption> accounts() {
        actors.requirePlanner();
        var linked = orm.people().stream().filter(person -> person.user != null)
                .collect(Collectors.toMap(person -> person.user.id, person -> person.id));
        return orm.accounts().stream().map(user -> new AccountOption(user.id, user.name, linked.get(user.id))).toList();
    }

    public AttendeeResponse saveAttendee(UUID eventId, UUID id, @Valid AttendeeInput input) {
        var event = writableEvent(eventId);
        validateRange(input.arrivesAt(), input.leavesAt());
        var attendee = id == null ? new EventAttendee() : orm.requireLocked(EventAttendee.class, id, "Attendee");
        if (id != null) requireEvent(eventId, attendee.event.id);
        var factions = orm.factions(event.eventType);
        var roles = roles(input.roles(), factions);
        var person = person(input);
        if (orm.attendances(eventId, person.id).stream().anyMatch(other -> !other.equals(attendee.id)))
            throw ApiException.conflict(person.name + " already attends this event");
        attendee.event = event;
        attendee.person = person;
        attendee.arrivesAt = input.arrivesAt();
        attendee.leavesAt = input.leavesAt();
        attendee.foodStampsIssued = input.foodStampsIssued();
        attendee.notes = Inputs.blankToNull(input.notes());
        attendee.roles.clear();
        attendee.roles.addAll(roles);
        if (id == null) orm.persist(attendee);
        changed(eventId, "attendees");
        return AttendeeResponse.from(attendee, factions);
    }

    /** Creates the person or renames/relinks the existing one; the change shows at every event. */
    private EventPerson person(AttendeeInput input) {
        var person = input.personId() == null ? new EventPerson() : orm.requireLocked(EventPerson.class, input.personId(), "Person");
        person.name = input.personName().trim();
        UserAccount user = input.personUserId() == null ? null : orm.require(UserAccount.class, input.personUserId(), "User");
        if (user != null) {
            var linked = orm.personLinkedTo(user.id);
            if (linked != null && !linked.equals(person)) throw ApiException.conflict(user.name + " is already linked to " + linked.name);
        }
        person.user = user;
        if (person.id == null) orm.persist(person);
        return person;
    }

    private List<EventAttendeeRole> roles(List<RoleInput> inputs, Map<UUID, Faction> factions) {
        var roles = new ArrayList<EventAttendeeRole>();
        var seen = new HashSet<String>();
        for (var input : inputs) {
            String assignment = Inputs.blankToNull(input.assignment());
            if (EventAttendeeRole.FACTION_ROLES.contains(input.role())) {
                if (input.factionId() == null || !factions.containsKey(input.factionId()))
                    throw ApiException.badRequest("Faction roles need a faction of this event type");
            } else if (input.factionId() != null) {
                throw ApiException.badRequest("Only faction roles can name a faction");
            }
            if (assignment != null && !"event_crew".equals(input.role()))
                throw ApiException.badRequest("Only event crew can have a work assignment");
            if (!seen.add(input.role() + ":" + input.factionId())) throw ApiException.badRequest("Duplicate role");
            roles.add(new EventAttendeeRole(input.role(), input.factionId(), assignment));
        }
        return roles;
    }

    public void deleteAttendee(UUID eventId, UUID id) {
        writableEvent(eventId);
        var attendee = orm.requireLocked(EventAttendee.class, id, "Attendee");
        requireEvent(eventId, attendee.event.id);
        orm.remove(attendee);
        changed(eventId, "attendees");
    }

    public List<TimelineResponse> timeline(UUID eventId) {
        requireRead();
        orm.require(EventOccurrence.class, eventId, "Event");
        return orm.timeline(eventId).stream().map(TimelineResponse::from).toList();
    }

    public TimelineResponse saveTimeline(UUID eventId, UUID id, @Valid TimelineInput input) {
        var event = writableEvent(eventId);
        validateRange(input.startsAt(), input.endsAt());
        var entry = id == null ? new EventTimelineEntry() : orm.requireLocked(EventTimelineEntry.class, id, "Timeline entry");
        if (id != null) requireEvent(eventId, entry.event.id);
        entry.event = event;
        entry.category = input.category();
        entry.title = input.title().trim();
        entry.startsAt = input.startsAt();
        entry.endsAt = input.endsAt();
        entry.owner = Inputs.blankToNull(input.owner());
        entry.location = Inputs.blankToNull(input.location());
        entry.status = input.status();
        entry.description = Inputs.blankToNull(input.description());
        if (id == null) orm.persist(entry);
        changed(eventId, "timeline");
        return TimelineResponse.from(entry);
    }

    public void deleteTimeline(UUID eventId, UUID id) {
        writableEvent(eventId);
        var entry = orm.requireLocked(EventTimelineEntry.class, id, "Timeline entry");
        requireEvent(eventId, entry.event.id);
        orm.remove(entry);
        changed(eventId, "timeline");
    }

    private EventOccurrence writableEvent(UUID id) {
        actors.requirePlanner();
        return orm.requireLocked(EventOccurrence.class, id, "Event");
    }

    private void requireRead() {
        if (!Set.of(DomainEnums.UserRole.hq_admin, DomainEnums.UserRole.warehouse_crew,
                DomainEnums.UserRole.marshal, DomainEnums.UserRole.event_planner,
                DomainEnums.UserRole.maintenance_crew).contains(actors.current().role))
            throw ApiException.forbidden("Event logistics access required");
    }

    private void requireEvent(UUID expected, UUID actual) {
        if (!expected.equals(actual)) throw ApiException.notFound("Event record not found");
    }

    private void validateRange(LocalDateTime start, LocalDateTime end) {
        if (start != null && end != null && end.isBefore(start))
            throw ApiException.badRequest("End time cannot be before start time");
    }

    private void changed(UUID eventId, String section) {
        events.record("event_logistics.changed", "event", eventId, actors.current().id, null,
                Map.of("eventId", eventId.toString(), "section", section));
    }
}
