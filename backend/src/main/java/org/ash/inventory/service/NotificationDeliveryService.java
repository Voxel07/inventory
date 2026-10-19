package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import io.quarkus.scheduler.Scheduled;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.ash.inventory.model.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;

/** Durable, at-least-once delivery. The gateway must deduplicate the notification UUID. */
@ApplicationScoped
public class NotificationDeliveryService {
    @Inject EntityManager em;
    @Inject ObjectMapper json;
    @ConfigProperty(name="inventory.notifications.webhook-url") Optional<String> endpoint;
    @ConfigProperty(name="inventory.notifications.webhook-token") Optional<String> token;
    @ConfigProperty(name="inventory.public-url", defaultValue="http://localhost:5173") String publicUrl;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    public record Delivery(UUID id, UUID lease, String email) {}

    @Scheduled(every="30s", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    public void deliver() {
        if (endpoint.isEmpty()) return;
        for (int count=0; count<20; count++) {
            var delivery = claim(); if (delivery == null) return;
            boolean sent = false;
            try {
                var uri = URI.create(endpoint.get());
                if (!"https".equals(uri.getScheme()) && !("http".equals(uri.getScheme()) && Set.of("localhost", "127.0.0.1", "::1").contains(uri.getHost())))
                    throw new IllegalArgumentException("Notification endpoint requires HTTPS");
                var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
                        .header("Idempotency-Key", delivery.id().toString());
                token.ifPresent(value -> request.header("Authorization", "Bearer " + value));
                // No task text, inventory identifiers, names or evidence leave the application.
                String body = json.writeValueAsString(Map.of("id", delivery.id(), "recipient", delivery.email(), "subject", "Inventory notification",
                        "text", "You have an inventory notification. Sign in to review your current tasks.", "url", publicUrl));
                var response = client.send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.discarding());
                sent = response.statusCode() >= 200 && response.statusCode() < 300;
            } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
              catch (Exception exception) { /* Persist only a safe error; never credentials or gateway responses. */ }
            finish(delivery, sent);
            if (Thread.currentThread().isInterrupted()) return;
        }
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public Delivery claim() {
        var ids = em.createNativeQuery("select id from notifications where delivery_status in ('pending','retry','sending') and coalesce(next_delivery_at, created_at) <= now() and (delivery_lease_until is null or delivery_lease_until < now()) order by created_at, id for update skip locked limit 20").getResultList();
        for (var id : ids) {
            var value = em.find(Notification.class, id); var user = value.recipient;
            boolean visible = user.active && user.email != null && !user.email.isBlank();
            if (visible && value.order != null) visible = visible("order", value.order.id, user);
            Object item = value.payload.get("itemId");
            if (visible && item != null) { try { visible = visible("item", UUID.fromString(item.toString()), user); } catch (IllegalArgumentException invalid) { visible=false; } }
            if (!visible) { value.deliveryStatus="skipped"; continue; }
            value.deliveryAttempts++;
            if (value.deliveryAttempts > 8) { value.deliveryStatus="failed"; value.lastDeliveryError="Delivery attempts exhausted"; continue; }
            value.deliveryStatus="sending"; value.deliveryLease=UUID.randomUUID(); value.deliveryLeaseUntil=Instant.now().plusSeconds(120);
            return new Delivery(value.id, value.deliveryLease, user.email);
        }
        return null;
    }
    private boolean visible(String kind, UUID id, UserAccount user) {
        return Boolean.TRUE.equals(em.createNativeQuery("select inventory_resource_visible(:kind,:id,:actor,:admin,:public)")
                .setParameter("kind",kind).setParameter("id",id).setParameter("actor",user.id)
                .setParameter("admin",user.role==DomainEnums.UserRole.admin).setParameter("public",user.role.atLeast(DomainEnums.UserRole.read_only)).getSingleResult());
    }
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void finish(Delivery delivery, boolean sent) {
        var value=em.find(Notification.class,delivery.id(),jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if (value == null || !Objects.equals(value.deliveryLease,delivery.lease())) return;
        value.deliveryStatus=sent?"sent":value.deliveryAttempts>=8?"failed":"retry";
        value.deliveredAt=sent?Instant.now():null; value.lastDeliveryError=sent?null:"Gateway did not acknowledge delivery";
        value.nextDeliveryAt=Instant.now().plusSeconds(Math.min(3600,30L << Math.min(value.deliveryAttempts,7)));
        value.deliveryLease=null; value.deliveryLeaseUntil=null;
    }
    @Scheduled(every="1m", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    @Transactional
    public void reminders() {
        var due=em.createNativeQuery("select id from action_reminders where remind_at <= now() order by remind_at for update skip locked limit 100").getResultList();
        for (var id:due) {
            var reminder=em.find(ActionReminder.class,id);
            if (reminder.user.active) {
                var notice=new Notification(); notice.recipient=reminder.user; notice.type="action_reminder";
                notice.dedupeKey="reminder:"+reminder.id+":"+reminder.remindAt;
                notice.payload.put("path","/"); notice.payload.put("reminder",true); em.persist(notice);
            }
            reminder.remindAt=null;
        }
    }

    /** One generic daily notice for currently authorized pickup, overdue-order, expiry or maintenance work. */
    @Scheduled(every="1h", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    @Transactional
    public void digest() {
        if (!Boolean.TRUE.equals(em.createNativeQuery("select pg_try_advisory_xact_lock(659743253)").getSingleResult())) return;
        String key="daily:"+org.ash.inventory.helper.BusinessTime.today();
        em.createNativeQuery("""
            insert into notifications(id,created_at,updated_at,recipient_id,type,payload,dedupe_key,delivery_status,delivery_attempts)
            select gen_random_uuid(),now(),now(),u.id,'action_digest','{"path":"/","reminder":true}'::jsonb,:key,'pending',0
            from app_users u where u.active=true and u.role<>'tenant'
            and not exists(select 1 from notifications n where n.recipient_id=u.id and n.type='action_digest' and n.dedupe_key=:key)
            and (
              exists(select 1 from orders o left join event_occurrences e on e.id=o.event_occurrence_id
                where (u.role in ('warehouse_crew','admin') or o.created_by=u.id)
                and (o.status='ready' or e.end_date<:today and exists(select 1 from order_lines line where line.order_id=o.id and line.handed_over_quantity-line.returned_quantity-line.damaged_quantity-line.consumed_quantity-line.written_off_quantity>0))
                and inventory_resource_visible('order',o.id,u.id,u.role='admin',true))
              or u.role in ('warehouse_crew','admin') and exists(select 1 from inventory_lots l where l.status='available' and (l.expiry_date<=:warning or l.best_before_date<=:warning)
                and inventory_resource_visible('item',l.item_id,u.id,u.role='admin',true))
              or exists(select 1 from maintenance_schedules s join items i on i.id=s.item_id left join asset_instances a on a.id=s.asset_instance_id
                where s.active=true and (u.role in ('warehouse_crew','admin') or s.responsible_person_id=u.id)
                and (s.warning_window is null or s.interval_type='date' and (s.next_due_at is null or s.next_due_at<=now()+s.warning_window*interval '1 day')
                  or s.interval_type='operating_hours' and (s.next_due_value is null or coalesce(a.operating_hours,i.current_operating_hours)+s.warning_window>=s.next_due_value)
                  or s.interval_type='usage_count' and (s.next_due_value is null or (select coalesce(sum(sign(t.quantity)),0) from stock_transactions t where t.item_id=s.item_id and t.type='checkout' and (s.asset_instance_id is null or t.asset_instance_id=s.asset_instance_id))+s.warning_window>=s.next_due_value))
                and inventory_resource_visible('item',s.item_id,u.id,u.role='admin',true))
            ) order by u.id limit 500 on conflict do nothing
            """).setParameter("key",key).setParameter("today",org.ash.inventory.helper.BusinessTime.today())
                .setParameter("warning",org.ash.inventory.helper.BusinessTime.today().plusDays(30)).executeUpdate();
    }
}
