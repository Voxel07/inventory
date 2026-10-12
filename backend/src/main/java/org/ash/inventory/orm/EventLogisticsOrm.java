package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.EventAttendee;
import org.ash.inventory.model.EventTimelineEntry;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class EventLogisticsOrm extends EntityOrm {
    public List<EventAttendee> attendees(UUID eventId) {
        return entityManager.createQuery("select a from EventAttendee a where a.event.id = :eventId order by lower(a.name), a.id", EventAttendee.class)
                .setParameter("eventId", eventId).getResultList();
    }

    public List<EventTimelineEntry> timeline(UUID eventId) {
        return entityManager.createQuery("select e from EventTimelineEntry e where e.event.id = :eventId order by e.startsAt, e.id", EventTimelineEntry.class)
                .setParameter("eventId", eventId).getResultList();
    }
}
