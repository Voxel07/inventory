package org.ash.inventory.integration.api;

import org.ash.inventory.integration.internal.DomainEvent;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;

/** Independent durable consumer leases; SSE publication does not acknowledge this feed. */
@ApplicationScoped
public class IntegrationFeed {
    @Inject EntityManager em;
    @Inject ObjectMapper json;
    public record Registration(List<String> prefixes,Instant since) {
        public Registration { prefixes=prefixes==null?List.of():List.copyOf(prefixes); }
    }
    public record Delivery(UUID lease,int attempt,DomainEventService.Envelope event) {}
    public record Batch(Instant oldestRetained,List<Delivery> deliveries) {}
    public record Receipt(UUID eventId,UUID lease) {}

    @Transactional
    public void register(String consumer,Registration input){
        validate(consumer);
        if(input==null || input.since()==null || !validPrefixes(input.prefixes()))
            throw ApiException.badRequest("Consumer requires a start time and 1 to 32 event prefixes");
        String encoded=encode(input.prefixes());
        var existing=em.createNativeQuery("select 1 from integration_subscriptions where name=:name")
                .setParameter("name",consumer).getResultList();
        if(!existing.isEmpty())throw ApiException.conflict("Consumer already registered; use a new consumer name to change its replay scope");
        em.createNativeQuery("insert into integration_subscriptions(name,prefixes,since) values(:name,cast(:prefixes as jsonb),:since)")
                .setParameter("name",consumer).setParameter("prefixes",encoded).setParameter("since",input.since().toEpochMilli()).executeUpdate();
    }

    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public Batch poll(String consumer,int limit){
        validate(consumer);
        if(limit<1 || limit>100)throw ApiException.badRequest("Consumer batch must contain 1 to 100 events");
        if(em.createNativeQuery("select 1 from integration_subscriptions where name=:name and enabled=true")
                .setParameter("name",consumer).getResultList().isEmpty())throw ApiException.notFound("Consumer not registered");
        var ids=em.createNativeQuery("""
            select e.id from domain_event_outbox e join integration_subscriptions s on s.name=:consumer
            where s.enabled=true and e.occurred_at>=s.since
              and exists(select 1 from jsonb_array_elements_text(s.prefixes) as prefixes(prefix) where left(e.event_type,length(prefix))=prefix)
              and not exists(select 1 from integration_deliveries d where d.consumer=s.name and d.event_id=e.event_id
                and (d.state in ('acknowledged','dead_letter') or d.lease_until>(extract(epoch from now()) * 1000)::bigint))
            order by e.occurred_at,e.id for update of e skip locked limit :limit
            """).setParameter("consumer",consumer).setParameter("limit",limit).getResultList();
        var deliveries=new ArrayList<Delivery>();
        for(var id:ids){
            var event=em.find(DomainEvent.class,id);var lease=UUID.randomUUID();
            var attempts=em.createNativeQuery("""
                insert into integration_deliveries(consumer,event_id,state,attempts,lease,lease_until)
                values(:consumer,:event,'leased',1,:lease,(extract(epoch from now()) * 1000)::bigint + 120000)
                on conflict(consumer,event_id) do update set state='leased',attempts=integration_deliveries.attempts+1,
                  lease=excluded.lease,lease_until=excluded.lease_until returning attempts
                """).setParameter("consumer",consumer).setParameter("event",event.eventId).setParameter("lease",lease).getSingleResult();
            if(((Number)attempts).intValue()>10){
                em.createNativeQuery("update integration_deliveries set state='dead_letter',lease=null,lease_until=null where consumer=:consumer and event_id=:event")
                        .setParameter("consumer",consumer).setParameter("event",event.eventId).executeUpdate();continue;
            }
            deliveries.add(new Delivery(lease,((Number)attempts).intValue(),DomainEventService.Envelope.from(event)));
        }
        var oldest=em.createQuery("select min(e.occurredAt) from DomainEvent e",Instant.class).getSingleResult();
        return new Batch(oldest,List.copyOf(deliveries));
    }

    /** In-process consumers declare their scope on every start; replay begins at the first declaration. */
    @Transactional
    public void subscribe(String consumer,List<String> prefixes){
        validate(consumer);
        if(prefixes==null || !validPrefixes(prefixes))throw new IllegalArgumentException("Consumer requires 1 to 32 event prefixes");
        em.createNativeQuery("insert into integration_subscriptions(name,prefixes,since) values(:name,cast(:prefixes as jsonb),(extract(epoch from now()) * 1000)::bigint) on conflict(name) do update set prefixes=excluded.prefixes,enabled=true")
                .setParameter("name",consumer).setParameter("prefixes",encode(prefixes)).executeUpdate();
    }

    /** External consumers commit their effects plus local event-ID inbox before acknowledging. */
    @Transactional
    public void acknowledge(String consumer,Receipt receipt){
        validate(consumer);
        if(receipt==null || receipt.eventId()==null || receipt.lease()==null)throw ApiException.badRequest("Event and lease are required");
        int changed=em.createNativeQuery("update integration_deliveries set state='acknowledged',acknowledged_at=(extract(epoch from now()) * 1000)::bigint,lease_until=null where consumer=:consumer and event_id=:event and lease=:lease and state in ('leased','acknowledged')")
                .setParameter("consumer",consumer).setParameter("event",receipt.eventId()).setParameter("lease",receipt.lease()).executeUpdate();
        if(changed==0)throw ApiException.conflict("Consumer delivery lease changed; poll again");
    }
    @Transactional
    public void retry(String consumer,UUID eventId){
        validate(consumer);
        int changed=em.createNativeQuery("update integration_deliveries set state='leased',attempts=0,lease=null,lease_until=null where consumer=:consumer and event_id=:event and state='dead_letter'")
                .setParameter("consumer",consumer).setParameter("event",eventId).executeUpdate();
        if(changed==0)throw ApiException.notFound("Consumer dead letter not found");
    }
    @Transactional
    public Map<String,Long> status(String consumer){
        validate(consumer);var result=new LinkedHashMap<String,Long>();
        for(var row:em.createNativeQuery("select state,count(*) from integration_deliveries where consumer=:consumer group by state")
                .setParameter("consumer",consumer).getResultList()){
            var values=(Object[])row;result.put(values[0].toString(),((Number)values[1]).longValue());
        }
        return result;
    }
    @Transactional
    public List<UUID> deadLetters(String consumer,int limit){
        validate(consumer);if(limit<1 || limit>100)throw ApiException.badRequest("Invalid consumer page size");
        return em.createNativeQuery("select event_id from integration_deliveries where consumer=:consumer and state='dead_letter' order by event_id limit :limit",UUID.class).setParameter("consumer",consumer).setParameter("limit",limit).getResultList();
    }
    @Transactional
    public void remove(String consumer){validate(consumer);em.createNativeQuery("delete from integration_subscriptions where name=:consumer").setParameter("consumer",consumer).executeUpdate();}
    private static boolean validPrefixes(List<String> prefixes){
        return !prefixes.isEmpty() && prefixes.size()<=32 && prefixes.stream().allMatch(p -> p!=null && p.matches("[a-z_]+\\.[a-z_]*"));
    }
    private String encode(List<String> prefixes){
        try{return json.writeValueAsString(prefixes);}catch(com.fasterxml.jackson.core.JsonProcessingException invalid){throw new IllegalArgumentException(invalid);}
    }
    private void validate(String consumer){if(consumer==null || !consumer.matches("[a-z][a-z0-9_-]{0,127}"))throw ApiException.badRequest("Invalid consumer name");}
}
