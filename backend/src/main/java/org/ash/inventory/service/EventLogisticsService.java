package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import org.ash.inventory.helper.Inputs;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.EventAttendee;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.EventTimelineEntry;
import org.ash.inventory.orm.EventLogisticsOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.dto.EventLogisticsDtos.*;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

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
        orm.require(EventOccurrence.class, eventId, "Event");
        return orm.attendees(eventId).stream().map(AttendeeResponse::from).toList();
    }

    public AttendeeResponse saveAttendee(UUID eventId, UUID id, @Valid AttendeeInput input) {
        var event = writableEvent(eventId);
        validateRange(input.arrivesAt(), input.leavesAt());
        var attendee = id == null ? new EventAttendee() : orm.requireLocked(EventAttendee.class, id, "Attendee");
        if (id != null) requireEvent(eventId, attendee.event.id);
        attendee.event = event;
        attendee.name = input.name().trim();
        attendee.role = input.role().trim();
        attendee.arrivesAt = input.arrivesAt();
        attendee.leavesAt = input.leavesAt();
        attendee.foodStampsIssued = input.foodStampsIssued();
        attendee.notes = Inputs.blankToNull(input.notes());
        if (id == null) orm.persist(attendee);
        changed(eventId, "attendees");
        return AttendeeResponse.from(attendee);
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
