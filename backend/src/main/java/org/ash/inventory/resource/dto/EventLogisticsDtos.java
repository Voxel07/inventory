package org.ash.inventory.resource.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.ash.inventory.model.EventAttendee;
import org.ash.inventory.model.EventTimelineEntry;
import java.time.LocalDateTime;
import java.util.UUID;

/** Times are wall-clock times at the event, with no browser timezone conversion. */
public final class EventLogisticsDtos {
    private EventLogisticsDtos() {}

    public record AttendeeInput(@NotBlank @Size(max = 255) String name,
            @NotBlank @Size(max = 255) String role, LocalDateTime arrivesAt, LocalDateTime leavesAt,
            boolean foodStampsIssued, @Size(max = 2000) String notes) {}

    public record AttendeeResponse(UUID id, UUID eventId, String name, String role,
            LocalDateTime arrivesAt, LocalDateTime leavesAt, int mainMealStamps, int breakfastStamps,
            boolean foodStampsIssued, String notes) {
        public static AttendeeResponse from(EventAttendee attendee) {
            return new AttendeeResponse(attendee.id, attendee.event.id, attendee.name, attendee.role,
                    attendee.arrivesAt, attendee.leavesAt, 4, 1, attendee.foodStampsIssued, attendee.notes);
        }
    }

    public record TimelineInput(@NotNull @Pattern(regexp = "in_game|preparation") String category,
            @NotBlank @Size(max = 255) String title, @NotNull LocalDateTime startsAt, LocalDateTime endsAt,
            @Size(max = 255) String owner, @Size(max = 255) String location,
            @NotNull @Pattern(regexp = "planned|in_progress|completed") String status,
            @Size(max = 2000) String description) {}

    public record TimelineResponse(UUID id, UUID eventId, String category, String title,
            LocalDateTime startsAt, LocalDateTime endsAt, String owner, String location,
            String status, String description) {
        public static TimelineResponse from(EventTimelineEntry entry) {
            return new TimelineResponse(entry.id, entry.event.id, entry.category, entry.title,
                    entry.startsAt, entry.endsAt, entry.owner, entry.location, entry.status, entry.description);
        }
    }
}
