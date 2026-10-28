package org.ash.inventory.operations.internal.application;

import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.operations.internal.model.ActionReminder;
import org.ash.inventory.platform.api.BusinessTime;
import org.ash.inventory.platform.api.EpochTime;
import org.ash.inventory.platform.runtime.WorkerRoles;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import io.quarkus.scheduler.Scheduled;
import java.util.*;
/** Operational task discovery owns its queries; delivery owns only the resulting notices. */
@ApplicationScoped
public class NotificationTaskService {
    @Inject EntityManager em;
    @Inject NotificationService notifications;
    @Inject org.ash.inventory.platform.runtime.WorkerRoles workers;
    @Scheduled(every="1m", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    @Transactional
    public void reminders() {
        if (!workers.enabled("reminders")) return;
        var due=em.createNativeQuery("select id from action_reminders where remind_at <= (extract(epoch from now()) * 1000)::bigint order by remind_at for update skip locked limit 100").getResultList();
        for (var id:due) {
            var reminder=em.find(ActionReminder.class,id);
            if (reminder.user.active) {
                notifications.enqueue(reminder.user.id,null,"action_reminder","reminder:"+reminder.id+":"+reminder.remindAt,
                        Map.of("path","/","reminder",true));
            }
            reminder.remindAt=null;
        }
    }

    /** One generic daily notice for currently authorized pickup, overdue-order, expiry or maintenance work. */
    @Scheduled(every="1h", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    @Transactional
    public void digest() {
        if (!workers.enabled("digests")) return;
        if (!Boolean.TRUE.equals(em.createNativeQuery("select pg_try_advisory_xact_lock(659743253)").getSingleResult())) return;
        String key="daily:"+org.ash.inventory.platform.api.BusinessTime.today();
        UUID after = new UUID(0,0);
        while (true) {
        var recipients = em.createNativeQuery("""
            select u.id
            from app_users u where u.active=true and u.role<>'tenant'
            and (
              exists(select 1 from orders o left join event_occurrences e on e.id=o.event_occurrence_id
                where (u.role in ('warehouse_crew','admin') or o.created_by=u.id)
                and (o.status='ready' or e.end_date<:today and exists(select 1 from order_lines line where line.order_id=o.id and line.handed_over_quantity-line.returned_quantity-line.damaged_quantity-line.consumed_quantity-line.written_off_quantity>0))
                and inventory_resource_visible('order',o.id,u.id,u.role='admin',true))
              or u.role in ('warehouse_crew','admin') and exists(select 1 from inventory_lots l where l.status='available' and l.expiry_date<=:warning
                and inventory_resource_visible('item',l.item_id,u.id,u.role='admin',true))
              or exists(select 1 from maintenance_schedules s join items i on i.id=s.item_id left join asset_instances a on a.id=s.asset_instance_id
                where s.active=true and (u.role in ('warehouse_crew','admin') or s.responsible_person_id=u.id)
                and (s.warning_window is null or s.interval_type='date' and (s.next_due_at is null or s.next_due_at<=(extract(epoch from now()) * 1000)::bigint+s.warning_window*86400000::bigint)
                  or s.interval_type='operating_hours' and (s.next_due_value is null or coalesce(a.operating_hours,i.current_operating_hours)+s.warning_window>=s.next_due_value)
                  or s.interval_type='usage_count' and (s.next_due_value is null or (select coalesce(sum(sign(t.quantity)),0) from stock_transactions t where t.item_id=s.item_id and t.type='checkout' and (s.asset_instance_id is null or t.asset_instance_id=s.asset_instance_id))+s.warning_window>=s.next_due_value))
                and inventory_resource_visible('item',s.item_id,u.id,u.role='admin',true))
            ) and u.id > :after order by u.id limit 200
            """).setParameter("after",after).setParameter("today",EpochTime.millis(BusinessTime.today()))
                .setParameter("warning",EpochTime.millis(BusinessTime.today().plusDays(30))).getResultList();
        for (var id : recipients) notifications.enqueue((UUID)id,null,"action_digest",key,Map.of("path","/","reminder",true));
        if(recipients.size()<200)break;
        after=(UUID)recipients.getLast();
        }
    }
}
