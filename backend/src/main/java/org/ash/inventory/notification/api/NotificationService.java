package org.ash.inventory.notification.api;

import org.ash.inventory.notification.internal.Notification;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.*;
/** The sole writer of notification records; callers provide IDs and immutable values. */
@ApplicationScoped
@Transactional
public class NotificationService {
    @Inject EntityManager em;
    public record Notice(UUID id, UUID recipientId, UUID orderId, String type, Map<String,Object> payload, Instant createdAt, Instant readAt) {
        public Notice { payload = Collections.unmodifiableMap(new LinkedHashMap<>(payload)); }
    }
    public record Delivery(UUID id, UUID lease, UUID recipientId, UUID orderId, UUID itemId) {}
    public enum Outcome { SENT, RETRY, SKIPPED }
    public UUID enqueue(UUID recipient, UUID order, String type, String dedupe, Map<String,Object> payload) {
        Objects.requireNonNull(recipient); Objects.requireNonNull(type); Objects.requireNonNull(payload);
        // Stable cross-node dedupe without locking another module's user row.
        em.createNativeQuery("select pg_advisory_xact_lock(659743254, hashtext(:recipient))").setParameter("recipient",recipient.toString()).getSingleResult();
        if(dedupe!=null) {
            var prior=em.createQuery("select n.id from Notification n where n.recipientId=:recipient and n.type=:type and n.dedupeKey=:key",UUID.class)
                    .setParameter("recipient",recipient).setParameter("type",type).setParameter("key",dedupe).setMaxResults(1).getResultList();
            if(!prior.isEmpty()) return prior.getFirst();
        }
        var n=new Notification();n.recipientId=recipient;n.orderId=order;n.type=type;n.dedupeKey=dedupe;n.payload=new LinkedHashMap<>(payload);em.persist(n);return n.id;
    }
    public boolean notified(UUID recipient,String type,String path) {
        return Boolean.TRUE.equals(em.createNativeQuery("select exists(select 1 from notifications where recipient_id=:recipient and type=:type and payload->>'path'=:path)")
                .setParameter("recipient",recipient).setParameter("type",type).setParameter("path",path).getSingleResult());
    }
    public boolean exists(UUID recipient,String type,String key) {
        return !em.createQuery("select n.id from Notification n where n.recipientId=:recipient and n.type=:type and n.dedupeKey=:key",UUID.class)
                .setParameter("recipient",recipient).setParameter("type",type).setParameter("key",key).setMaxResults(1).getResultList().isEmpty();
    }
    public List<Notice> forRecipient(UUID recipient,boolean unread,int offset,int limit) {
        if(offset<0 || limit<1 || limit>200) throw ApiException.badRequest("Invalid notification page bounds");
        return em.createQuery("from Notification n where n.recipientId=:recipient"+(unread?" and n.readAt is null":"")+" order by n.createdAt desc,n.id desc",Notification.class)
                .setParameter("recipient",recipient).setFirstResult(offset).setMaxResults(limit).getResultList().stream().map(this::view).toList();
    }
    public int markAllRead(UUID recipient,Instant before,Instant now) {
        return em.createQuery("update Notification n set n.readAt=:now where n.recipientId=:recipient and n.readAt is null and n.createdAt<=:before")
                .setParameter("now",now).setParameter("recipient",recipient).setParameter("before",before).executeUpdate();
    }
    public long unreadCount(UUID recipient) {
        return em.createQuery("select count(n) from Notification n where n.recipientId=:recipient and n.readAt is null",Long.class).setParameter("recipient",recipient).getSingleResult();
    }
    public Notice markRead(UUID recipient,UUID id) {
        var n=em.find(Notification.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(n==null || !n.recipientId.equals(recipient)) throw ApiException.notFound("Notification not found");
        n.readAt=Instant.now();return view(n);
    }
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public Delivery claim() {
        var ids=em.createNativeQuery("select id from notifications where delivery_status in ('pending','retry','sending') and coalesce(next_delivery_at,created_at)<=(extract(epoch from now()) * 1000)::bigint and (delivery_lease_until is null or delivery_lease_until<(extract(epoch from now()) * 1000)::bigint) order by created_at,id for update skip locked limit 20").getResultList();
        if(ids.isEmpty())return null;
        for(var id:ids){
        var n=em.find(Notification.class,id);
        if(n.deliveryAttempts>=8){n.deliveryStatus="failed";n.lastDeliveryError="Delivery attempts exhausted";continue;}
        n.deliveryAttempts++;n.deliveryStatus="sending";n.deliveryLease=UUID.randomUUID();n.deliveryLeaseUntil=Instant.now().plusSeconds(120);
        UUID item=null;try{if(n.payload.get("itemId")!=null)item=UUID.fromString(n.payload.get("itemId").toString());}
        catch(IllegalArgumentException invalid){n.deliveryStatus="skipped";n.deliveryLease=null;n.deliveryLeaseUntil=null;continue;}
        return new Delivery(n.id,n.deliveryLease,n.recipientId,n.orderId,item);
        }
        return null;
    }
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public void finish(Delivery delivery,Outcome outcome) {
        var n=em.find(Notification.class,delivery.id(),LockModeType.PESSIMISTIC_WRITE);
        if(n==null || !Objects.equals(n.deliveryLease,delivery.lease()) || !"sending".equals(n.deliveryStatus))return;
        n.deliveryStatus=outcome==Outcome.SENT?"sent":outcome==Outcome.SKIPPED?"skipped":n.deliveryAttempts>=8?"failed":"retry";
        n.deliveredAt=outcome==Outcome.SENT?Instant.now():null;n.lastDeliveryError=outcome==Outcome.RETRY?"Gateway did not acknowledge delivery":null;
        n.nextDeliveryAt=Instant.now().plusSeconds(Math.min(3600,30L<<Math.min(n.deliveryAttempts,7)));n.deliveryLease=null;n.deliveryLeaseUntil=null;
    }
    public List<String> personalData(UUID recipient,int offset,int limit){
        if(offset<0 || limit<1 || limit>100)throw ApiException.badRequest("Invalid export bounds");
        return em.createNativeQuery("select cast(row_to_json(n) as text) from notifications n where n.recipient_id=:id order by n.created_at,n.id offset :offset limit :limit")
            .setParameter("id",recipient).setParameter("offset",offset).setParameter("limit",limit).getResultList().stream().map(Object::toString).toList();
    }
    public void erase(UUID recipient){em.createQuery("delete from Notification n where n.recipientId=:id").setParameter("id",recipient).executeUpdate();}
    public int purge(int days){return em.createNativeQuery("delete from notifications where id in (select id from notifications where created_at<(extract(epoch from now()) * 1000)::bigint - cast(:days as bigint) * 86400000 and delivery_status in ('sent','skipped','failed') order by created_at limit 1000)").setParameter("days",days).executeUpdate();}
    private Notice view(Notification n){return new Notice(n.id,n.recipientId,n.orderId,n.type,n.payload,n.createdAt,n.readAt);}
}
