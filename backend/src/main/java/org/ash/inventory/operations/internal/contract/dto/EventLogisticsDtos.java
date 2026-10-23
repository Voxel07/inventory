package org.ash.inventory.operations.internal.contract.dto;

import org.ash.inventory.operations.internal.model.EventAttendee;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.EventPerson;
import org.ash.inventory.operations.internal.model.EventTimelineEntry;
import org.ash.inventory.operations.internal.model.Faction;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Times are wall-clock times at the event, with no browser timezone conversion. */
public final class EventLogisticsDtos {
    private EventLogisticsDtos() {}

    public record CateringSettings(@Min(0) @Max(1000) int dailyMainMealStamps,
            @Min(0) @Max(1000) int dailyBreakfastStamps, @Min(0) @Max(1000) int firstDayMainMealStamps) {
        public static CateringSettings from(EventOccurrence event) {
            return new CateringSettings(event.dailyMainMealStamps, event.dailyBreakfastStamps, event.firstDayMainMealStamps);
        }
    }

    /** Faction roles require one of the event type's factions; only event crew carries an assignment. */
    public record RoleInput(
            @NotNull @Pattern(regexp = "faction_leader|faction_deputy|faction_hq_crew|as_held|event_crew") String role,
            UUID factionId, @Size(max = 255) String assignment) {}

    /**
     * Without {@code personId} a new person named {@code personName} is created. With it, the person is
     * renamed and (un)linked in place, which applies to every event they attend.
     */
    public record AttendeeInput(UUID personId, @NotBlank @Size(max = 255) String personName, UUID personUserId,
            Instant arrivesAt, Instant leavesAt, boolean foodStampsIssued, @Size(max = 2000) String notes,
            @NotNull @Size(min = 1, max = 20) List<@NotNull @Valid RoleInput> roles) {}

    /** A directory entry; renaming or relinking applies at every event the person attends. */
    public record PersonInput(@NotBlank @Size(max = 255) String name, UUID userId) {}

    public record PersonSummary(UUID id, String name, UUID userId, String userName) {
        public static PersonSummary from(EventPerson person) {
            return new PersonSummary(person.id, person.name,
                    person.user == null ? null : person.user.id, person.user == null ? null : person.user.name);
        }
    }

    public record PersonResponse(UUID id, String name, UUID userId, String userName, long attendances) {}

    public record AccountOption(UUID id, String name, UUID linkedPersonId) {}

    public record RoleResponse(String role, UUID factionId, String factionName, String assignment) {}

    public record AttendeeResponse(UUID id, UUID eventId, PersonSummary person, List<RoleResponse> roles,
            Instant arrivesAt, Instant leavesAt, int mainMealStamps, int breakfastStamps,
            boolean foodStampsIssued, String notes) {
        public static AttendeeResponse from(EventAttendee attendee, Map<UUID, Faction> factions, int mainMealStamps, int breakfastStamps) {
            var roles = attendee.roles.stream().map(role -> new RoleResponse(role.role, role.factionId,
                    role.factionId == null || !factions.containsKey(role.factionId) ? null : factions.get(role.factionId).name,
                    role.assignment)).toList();
            return new AttendeeResponse(attendee.id, attendee.event.id, PersonSummary.from(attendee.person), roles,
                    attendee.arrivesAt, attendee.leavesAt, mainMealStamps, breakfastStamps,
                    attendee.foodStampsIssued, attendee.notes);
        }
    }

    public record TimelineInput(@NotNull @Pattern(regexp = "in_game|preparation|catering") String category,
            @NotBlank @Size(max = 255) String title, @NotNull Instant startsAt, Instant endsAt,
            @Size(max = 255) String owner, @Size(max = 255) String location,
            @NotNull @Pattern(regexp = "planned|in_progress|completed") String status,
            @Size(max = 2000) String description) {}

    public record TimelineResponse(UUID id, UUID eventId, String category, String title,
            Instant startsAt, Instant endsAt, String owner, String location,
            String status, String description) {
        public static TimelineResponse from(EventTimelineEntry entry) {
            return new TimelineResponse(entry.id, entry.event.id, entry.category, entry.title,
                    entry.startsAt, entry.endsAt, entry.owner, entry.location, entry.status, entry.description);
        }
    }
}
