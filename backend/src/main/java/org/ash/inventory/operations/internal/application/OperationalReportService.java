package org.ash.inventory.operations.internal.application;

import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.reporting.api.ReportApi;
import org.ash.inventory.reporting.api.ReportDefinitions;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.*;
@ApplicationScoped
public class OperationalReportService {
    @Inject ActorService actors;
    @Inject ReportApi reports;
    public Map<String,String> definitions(){actors.requireWarehouse();return ReportDefinitions.all();}
    public ReportApi.View read(String name,Map<String,String> filters,int page,int size){actors.requireWarehouse();return reports.read(name,filters,page,size,actors.current().id);}
    public ReportApi.View export(String name,Map<String,String> filters,Instant generation){actors.requireWarehouse();return reports.export(name,filters,generation,actors.current().id);}
    public ReportApi.Job rebuild(String name){actors.requireWarehouse();return reports.request(name,actors.current().id);}
    public ReportApi.Job job(String name){actors.requireWarehouse();return reports.job(name,actors.current().id);}
}
