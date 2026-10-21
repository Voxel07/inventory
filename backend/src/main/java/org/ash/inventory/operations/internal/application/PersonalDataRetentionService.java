package org.ash.inventory.operations.internal.application;

import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.platform.runtime.WorkerRoles;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import io.quarkus.scheduler.Scheduled;
import org.eclipse.microprofile.config.inject.ConfigProperty;
/** Bounded expiry of transient personal data. Business history has deliberate, indefinite retention. */
@ApplicationScoped
public class PersonalDataRetentionService {
    @jakarta.inject.Inject org.ash.inventory.platform.runtime.WorkerRoles workers;
    @Inject NotificationService notifications;
    @Inject EntityManager em;
    @ConfigProperty(name="inventory.retention.notifications-days",defaultValue="180") int notificationsDays;
    @ConfigProperty(name="inventory.retention.reminders-days",defaultValue="180") int remindersDays;
    @ConfigProperty(name="inventory.retention.unlinked-attendees-days",defaultValue="730") int attendeeDays;
    @Scheduled(every="24h",concurrentExecution=Scheduled.ConcurrentExecution.SKIP) @Transactional
    public void purge() {
        if (!workers.enabled("retention")) return;
        if (notificationsDays>0) notifications.purge(notificationsDays);
        if (remindersDays>0) em.createNativeQuery("delete from action_reminders where id in (select id from action_reminders where remind_at is null and updated_at < now()-make_interval(days=>:days) order by updated_at limit 1000)").setParameter("days",remindersDays).executeUpdate();
        if (attendeeDays>0) {
            var ids=em.createNativeQuery("select p.id from event_people p where p.user_id is null and p.name not like 'Former attendee %' and exists(select 1 from event_attendees a where a.person_id=p.id) and not exists(select 1 from event_attendees a join event_occurrences e on e.id=a.event_id where a.person_id=p.id and e.end_date >= current_date-:days) order by p.id limit 1000").setParameter("days",attendeeDays).getResultList();
            for(var id:ids) {
                em.createNativeQuery("update event_people set name=:alias,updated_at=now() where id=:id").setParameter("alias","Former attendee "+id.toString().substring(0,8)).setParameter("id",id).executeUpdate();
                em.createNativeQuery("update event_attendees set notes=null where person_id=:id").setParameter("id",id).executeUpdate();
            }
        }
    }
}
