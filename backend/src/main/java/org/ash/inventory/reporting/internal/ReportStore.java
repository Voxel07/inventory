package org.ash.inventory.reporting.internal;

import org.ash.inventory.platform.persistence.ConsistentRead;
import org.ash.inventory.reporting.api.ReportApi;
import org.ash.inventory.reporting.api.ReportPolicy;
import org.ash.inventory.reporting.api.ReportSource;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;

/** Only report storage is queried here. Bounded batches go to the owner for current authorization. */
@ApplicationScoped
public class ReportStore {
    @Inject EntityManager em;
    @Inject ObjectMapper json;
    @Inject ReportPolicy policy;
    @Inject ReportSource source;
    @Inject ReportJobs jobs;
    public record Header(Instant startedAt,Instant generatedAt,String sourceToken) {}
    public record Page(int total,List<Map<String,Object>> rows,List<Map<String,Object>> monthlyTotals) {}
    public record Read(Header header,boolean stale,Page page,ReportApi.Job job) {}

    /** Authorization, freshness, rows and job state from one snapshot on one connection; never queues work. */
    @ConsistentRead @Transactional(Transactional.TxType.REQUIRES_NEW)
    public Read read(String name,Map<String,String> filters,UUID actor,long offset,int limit){
        policy.requireRead(actor);
        var header=header(name);
        boolean stale=header==null || !Objects.equals(header.sourceToken(),source.token(name)) || header.generatedAt().isBefore(Instant.now().minusSeconds(300));
        var page=header==null?new Page(0,List.of(),List.of()):rows(name,filters,actor,offset,limit);
        return new Read(header,stale,page,jobs.status(name));
    }
    private Header header(String name){
        var rows=em.createQuery("select r.startedAt,r.generatedAt,r.sourceToken from OperationalReport r where r.name=:name",Object[].class).setParameter("name",name).getResultList();
        if(rows.isEmpty())return null;var row=rows.getFirst();return new Header((Instant)row[0],(Instant)row[1],(String)row[2]);
    }
    public Page rows(String name,Map<String,String> filters,UUID actor,long offset,int limit){
        if(!Set.of("itemId","eventId","locationId","siteId","category","status","from","to","search").containsAll(filters.keySet()))
            throw new org.ash.inventory.platform.api.ApiException(400,"Unknown report filter");
        var where=new StringBuilder(" where r.name=:name");var parameters=new LinkedHashMap<String,Object>();parameters.put("name",name);
        for(var f:filters.entrySet()){
            if(f.getValue()==null || f.getValue().isBlank())continue;
            String key=f.getKey(),parameter="f_"+key;
            if(key.equals("search")){
                where.append(" and exists(select 1 from jsonb_each_text(value) f where lower(f.value) like :").append(parameter).append(" escape '!')");
                parameters.put(parameter,"%"+org.ash.inventory.platform.api.Inputs.escapeLike(f.getValue().toLowerCase(Locale.ROOT))+"%");
            }else{
                boolean dateFilter = key.equals("from") || key.equals("to");
                if (dateFilter) {
                    where.append(" and cast(value->>'date' as bigint) ").append(key.equals("from") ? ">=" : "<=").append(" :").append(parameter);
                    parameters.put(parameter, Long.parseLong(f.getValue()));
                } else {
                    where.append(" and value->>'").append(key).append("' = :").append(parameter);
                    parameters.put(parameter, f.getValue());
                }
            }
        }
        var query=em.createNativeQuery("select cast(value as text) from operational_reports r cross join lateral jsonb_array_elements(r.report_rows) with ordinality snapshot(value,ordinal)"+where+" order by ordinal");
        parameters.forEach(query::setParameter);query.setHint("org.hibernate.fetchSize",200);
        var output=new ArrayList<Map<String,Object>>();var totals=new TreeMap<String,Map<String,Object>>();int total=0;
        try(var stream=query.getResultStream()){
            var iterator=stream.iterator();
            while(iterator.hasNext()){
                var batch=new ArrayList<Map<String,Object>>();while(iterator.hasNext() && batch.size()<200)batch.add(decode(iterator.next().toString()));
                var allowed=policy.allowed(actor,batch);
                for(int index=0;index<batch.size();index++){
                    if(!allowed.contains(index))continue;
                    var row=batch.get(index);if(total>=offset && output.size()<limit)output.add(row);total++;
                    if(filters.containsKey("itemId") && Set.of("purchases","movements").contains(name))aggregate(name,row,totals);
                }
            }
        }
        return new Page(total,List.copyOf(output),List.copyOf(totals.values()));
    }
    private void aggregate(String name,Map<String,Object> row,Map<String,Map<String,Object>> totals){
        String key=row.get("month")+":"+row.get("status");var total=totals.computeIfAbsent(key,k->{var v=new LinkedHashMap<String,Object>();v.put("month",row.get("month"));v.put("status",row.get("status"));return v;});
        for(var field:name.equals("purchases")?List.of("ordered","received","openDelivery","valueCents"):List.of("quantity")){
            Object value=row.get(field);long amount=value instanceof Number n?n.longValue():0;
            long previous=total.get(field) instanceof Number n?n.longValue():0;total.put(field,Math.addExact(previous,amount));
        }
    }
    private Map<String,Object> decode(String value){try{return json.readValue(value,new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){});}catch(com.fasterxml.jackson.core.JsonProcessingException ex){throw new IllegalStateException("Invalid report generation",ex);}}
}
