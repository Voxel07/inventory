package org.ash.inventory.orm;

import jakarta.enterprise.context.ApplicationScoped;
import org.ash.inventory.model.EventAttendee;
import org.ash.inventory.model.EventPerson;
import org.ash.inventory.model.EventTimelineEntry;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.UserAccount;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@ApplicationScoped
public class EventLogisticsOrm extends EntityOrm {
    public List<EventAttendee> attendees(UUID eventId) {
        return entityManager.createQuery("""
                select a from EventAttendee a join fetch a.person p left join fetch p.user left join fetch a.roles
                where a.event.id = :eventId order by lower(p.name), a.id""", EventAttendee.class)
                .setParameter("eventId", eventId).getResultList();
    }

    public List<UUID> attendances(UUID eventId, UUID personId) {
        return entityManager.createQuery("select a.id from EventAttendee a where a.event.id = :eventId and a.person.id = :personId", UUID.class)
                .setParameter("eventId", eventId).setParameter("personId", personId).getResultList();
    }

    public List<EventPerson> people() {
        return entityManager.createQuery("select p from EventPerson p left join fetch p.user order by lower(p.name), p.id", EventPerson.class)
                .getResultList();
    }

    public Map<UUID, Long> attendanceCounts() {
        return entityManager.createQuery("select a.person.id, count(a) from EventAttendee a group by a.person.id", Object[].class)
                .getResultStream().collect(Collectors.toMap(row -> (UUID) row[0], row -> (Long) row[1]));
    }

    public EventPerson personLinkedTo(UUID userId) {
        return entityManager.createQuery("select p from EventPerson p where p.user.id = :userId", EventPerson.class)
                .setParameter("userId", userId).getResultStream().findFirst().orElse(null);
    }

    public List<UserAccount> accounts() {
        return entityManager.createQuery("select u from UserAccount u order by lower(u.name), u.id", UserAccount.class).getResultList();
    }

    public Map<UUID, Faction> factions(String eventType) {
        return entityManager.createQuery("select f from Faction f where f.eventType = :eventType", Faction.class)
                .setParameter("eventType", eventType).getResultStream()
                .collect(Collectors.toMap(faction -> faction.id, faction -> faction));
    }

    public List<EventTimelineEntry> timeline(UUID eventId) {
        return entityManager.createQuery("select e from EventTimelineEntry e where e.event.id = :eventId order by e.startsAt, e.id", EventTimelineEntry.class)
                .setParameter("eventId", eventId).getResultList();
    }
}
