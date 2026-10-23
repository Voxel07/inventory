package org.ash.inventory.reporting.api;

import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.reporting.internal.ReportJobs;
import org.ash.inventory.reporting.internal.ReportStore;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.time.*;
import java.util.*;

/** Reporting owns its generations and jobs; operational data is supplied through value ports. */
@ApplicationScoped
public class ReportApi {
    @Inject ReportStore store;
    @Inject ReportJobs jobs;
    @Inject ReportPolicy policy;

    public record Job(String state, int attempts, Instant requestedAt, String error) {}
    public record View(String name, String definition, Instant startedAt, Instant generatedAt, boolean stale,
            int total, List<Map<String,Object>> rows, List<Map<String,Object>> monthlyTotals, Job job) {}

    public View read(String name, Map<String,String> filters, int page, int size, UUID actor) {
        validate(name, filters);
        if(page<0 || page>100000 || size<1 || size>200) throw ApiException.badRequest("Invalid report page bounds");
        var read=store.read(name,filters,actor,(long)page*size,size);
        // Queue only after the read transaction ended: a stale read never holds two pooled connections.
        return view(name,read,read.stale()?jobs.enqueue(name,actor,false):read.job());
    }

    public View export(String name, Map<String,String> filters, Instant generation, UUID actor) {
        validate(name,filters);
        if(generation==null)throw ApiException.badRequest("Export requires a report generation");
        var read=store.read(name,filters,actor,0,25000);
        if(read.header()==null || !generation.equals(read.header().generatedAt()))throw ApiException.conflict("Report generation changed during export; restart the export");
        if(read.page().total()>25000)throw new ApiException(413,"Report export exceeds 25,000 rows; narrow the filters");
        return view(name,read,read.job());
    }

    public Job request(String name,UUID actor){validate(name,Map.of());policy.requireRead(actor);return jobs.enqueue(name,actor,true);}
    @Transactional public Job job(String name,UUID actor){validate(name,Map.of());policy.requireRead(actor);return jobs.status(name);}

    private View view(String name,ReportStore.Read read,Job job){
        var header=read.header();var page=read.page();
        return new View(name,ReportDefinitions.all().get(name),header==null?null:header.startedAt(),header==null?null:header.generatedAt(),read.stale(),
                page.total(),page.rows(),page.monthlyTotals(),job);
    }
    private void validate(String name,Map<String,String> filters){
        if(!ReportDefinitions.all().containsKey(name))throw ApiException.notFound("Unknown report");
        if(filters==null)throw ApiException.badRequest("Report filters are required");
        var allowed=Set.of("itemId","eventId","locationId","siteId","category","status","from","to","search");
        if(!allowed.containsAll(filters.keySet()))throw ApiException.badRequest("Unknown report filter");
        try {
            var from=filters.containsKey("from")?org.ash.inventory.platform.api.EpochTime.date(Long.parseLong(filters.get("from"))):null;
            var to=filters.containsKey("to")?org.ash.inventory.platform.api.EpochTime.date(Long.parseLong(filters.get("to"))):null;
            if(from!=null && to!=null && from.isAfter(to))throw ApiException.badRequest("Start date must not follow end date");
        } catch(IllegalArgumentException invalid){throw ApiException.badRequest("Use midnight UTC epoch milliseconds for dates");}
    }
}
