package org.ash.inventory;

import org.ash.inventory.reporting.internal.ReportStore;
import org.ash.inventory.notification.internal.Notification;
import org.ash.inventory.notification.internal.NotificationDeliveryService;
import org.ash.inventory.operations.adapter.mcp.InventoryMcpResources;
import org.ash.inventory.operations.adapter.mcp.InventoryMcpTools;
import org.ash.inventory.operations.internal.application.MaintenancePolicy;
import org.ash.inventory.operations.internal.application.PersonalDataRetentionService;
import org.ash.inventory.operations.internal.model.ActionReminder;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EventAttendee;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.EventPerson;
import org.ash.inventory.operations.internal.model.InventoryAccessPolicy;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.MaintenanceSchedule;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.reporting.internal.OperationalReport;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.TestTransaction;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
class ReviewFollowupApiTest {
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.NotificationTaskService notificationTasks;
    @Inject EntityManager em;
    @Inject InventoryMcpResources resources;
    @Inject InventoryMcpTools tools;
    @Inject ReportStore reportRows;
    @Inject PersonalDataRetentionService retention;
    @Inject NotificationDeliveryService delivery;
    private RequestSpecification actor(String id, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "followup-"+id).header("X-Actor-Role", role);
    }
    private RequestSpecification admin() { return actor("admin", "admin"); }
    private String item(String name, boolean privateResource, int amount) {
        return admin().body(Map.of("sku","FOLLOW-"+UUID.randomUUID(),"name",name,"category","Follow-up","value",0,"amount",amount,"privateResource",privateResource))
                .post("/api/items").then().statusCode(200).extract().path("id");
    }
    private UserAccount user(String name) {
        var user = new UserAccount(); user.issuer="test"; user.externalSubject=UUID.randomUUID().toString(); user.name=name; em.persist(user); return user;
    }

    @Test void visibleChildRedactsAncestorCodesAndDepthAndEditsKeepItsHiddenParent() {
        String viewer=actor("child-editor","warehouse_crew").get("/api/auth/me").then().extract().path("id");
        String parent=null, leaf=null;
        for (int level=0; level<4; level++) {
            var body=new HashMap<String,Object>(Map.of("name","Hidden ancestor "+level+" "+UUID.randomUUID(),"code","LV"+level,"privateResource",true));
            if (parent!=null) body.put("parentLocationId",parent);
            leaf=admin().body(body).post("/api/storage-locations").then().statusCode(200).extract().path("id");
            if (level<3) parent=leaf;
        }
        var access=admin().get("/api/access/storage-locations/"+leaf).then().extract().jsonPath();
        admin().body(Map.of("revision",access.getLong("revision"),"reason","Share child only","grants",List.of(Map.of("userId",viewer,"canEdit",true))))
                .put("/api/access/storage-locations/"+leaf).then().statusCode(200);
        actor("child-editor","warehouse_crew").get("/api/storage-locations/"+leaf).then().statusCode(200)
                .body("fullCode",equalTo("LV3")).body("depth",nullValue()).body("parentLocationId",nullValue())
                .body("hierarchyPath",not(containsString("Hidden ancestor 0")));
        actor("child-editor","warehouse_crew").body(Map.of("name","Visible child renamed","code","LV3","keepParent",true))
                .patch("/api/storage-locations/"+leaf).then().statusCode(200).body("depth",nullValue());
        admin().get("/api/storage-locations/"+leaf).then().statusCode(200).body("depth",equalTo(3)).body("parentLocationId",equalTo(parent));
    }

    private Map<String,Object> structure(int levels) {
        Map<String,Object> child=null;
        for(int level=levels-1;level>=1;level--) child=Map.of("name","Level "+level,"code","L"+level,"children",child==null?List.of():List.of(child));
        return Map.of("name","Boundary tree "+UUID.randomUUID(),"code","TREE","sections",child==null?List.of():List.of(child));
    }
    @Test void structureBoundariesRejectBeforeWritingAndAcceptSixteenTotalLevels() {
        admin().body(structure(16)).put("/api/storage-locations/structure").then().statusCode(200).body("size()",equalTo(16));
        long before=QuarkusTransaction.requiringNew().call(()->em.createQuery("select count(l) from StorageLocation l",Long.class).getSingleResult());
        admin().body(structure(17)).put("/api/storage-locations/structure").then().statusCode(400);
        var children=new ArrayList<Map<String,Object>>();
        for(int i=0;i<1000;i++) children.add(Map.of("name","Node "+i,"code","N"+i));
        admin().body(Map.of("name","Too many nodes","sections",children)).put("/api/storage-locations/structure").then().statusCode(400);
        assertEquals(before,QuarkusTransaction.requiringNew().call(()->em.createQuery("select count(l) from StorageLocation l",Long.class).getSingleResult()));
    }

    @Test void restAndMcpEventPagesHaveStableContinuationWithoutDuplicates() {
        String type="PG"+UUID.randomUUID().toString().replace("-","").toUpperCase(Locale.ROOT);
        var expected=QuarkusTransaction.requiringNew().call(()->{
            var ids=new HashSet<String>();
            for(int i=0;i<5;i++) { var event=new EventOccurrence();event.name="Page "+i;event.eventType=type;event.startDate=LocalDate.of(2090,1,1).plusDays(i);event.endDate=event.startDate;em.persist(event);ids.add(event.id.toString()); }
            return ids;
        });
        var actual=new HashSet<String>();
        for(int page=0;page<3;page++) {
            var ids=admin().get("/api/events?eventType="+type+"&size=2&page="+page).then().statusCode(200)
                    .header("X-Has-More",equalTo(String.valueOf(page<2))).extract().jsonPath().getList("id",String.class);
            assertEquals(ids.size(),ids.stream().filter(actual::add).count());
        }
        assertEquals(expected,actual);
        var mcpIds=new HashSet<String>();
        for(int page=0;;page++) {
            var values=tools.list_events("planned",page,100);
            for(var value:values) assertTrue(mcpIds.add(value.id().toString()),"Duplicate MCP event across pages");
            if(values.size()<100)break;
        }
        assertTrue(mcpIds.containsAll(expected));
    }

    @Test void mcpLocationResourceDeclaresItsFirstPageAndNamesItsContinuationTool() throws Exception {
        QuarkusTransaction.requiringNew().run(()->{for(int i=0;i<110;i++){var location=new StorageLocation();location.name="Resource page "+UUID.randomUUID();em.persist(location);}});
        var json=new com.fasterxml.jackson.databind.ObjectMapper().readTree(resources.locations().text());
        assertEquals(100,json.get("rows").size());assertEquals(0,json.get("page").asInt());assertTrue(json.get("hasMore").asBoolean());
        assertEquals(1,json.get("nextPage").asInt());assertEquals("list_storage_locations",json.get("continuationTool").asText());
        var first=new HashSet<String>();json.get("rows").forEach(row->first.add(row.get("id").asText()));
        assertTrue(tools.list_storage_locations(null,1,100).stream().noneMatch(l->first.contains(l.id().toString())));
    }

    @Test void reversalRecordsItsExecutorWithoutMovingCustodyToTheAdministrator() {
        String id=item("Beneficiary reversal",false,2);
        String beneficiary=actor("beneficiary","warehouse_crew").get("/api/auth/me").then().extract().path("id");
        String executor=admin().get("/api/auth/me").then().extract().path("id");
        String tx=actor("beneficiary","warehouse_crew").body(Map.of("itemId",id,"transactionType","checkout","quantityChanged",1,"reason","Field custody"))
                .post("/api/transactions").then().statusCode(200).extract().path("id");
        admin().body(Map.of("commandId",UUID.randomUUID().toString(),"reason","Wrong checkout"))
                .post("/api/transactions/"+tx+"/reversal").then().statusCode(200).body("userId",equalTo(beneficiary)).body("reversedBy.id",equalTo(executor));
        admin().get("/api/transactions?itemId="+id).then().statusCode(200).body("find { it.reversesId=='"+tx+"' }.reversedBy.id",equalTo(executor));
        actor("beneficiary","warehouse_crew").get("/api/member/custody").then().statusCode(200).body("findAll { it.itemId=='"+id+"' && it.checkedOut>0 }",empty());
        admin().get("/api/items/"+id).then().statusCode(200).body("stock.onHand",equalTo(2));
    }

    @Test void transactionPrivacyRunsBeforePageSelectionForHiddenLocationRelationships() {
        String id=item("Mixed-visibility movement pages",false,2);
        String visible=admin().body(Map.of("itemId",id,"transactionType","adjusted","quantityChanged",1,"reason","Visible movement"))
                .post("/api/transactions").then().statusCode(200).extract().path("id");
        String parent=admin().body(Map.of("name","Hidden movement site "+UUID.randomUUID(),"privateResource",true))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        String location=admin().body(Map.of("name","Hidden movement section","parentLocationId",parent,"privateResource",true))
                .post("/api/storage-locations").then().statusCode(200).extract().path("id");
        admin().body(Map.of("itemId",id,"transactionType","adjusted","quantityChanged",1,"reason","SECRET movement","locationId",location))
                .post("/api/transactions").then().statusCode(200);
        actor("movement-reader","warehouse_crew").get("/api/transactions?itemId="+id+"&size=1").then().statusCode(200)
                .header("X-Has-More",equalTo("true")).body("[0].id",equalTo(visible));
    }

    @Test void concurrentOnOpenRefreshServesTheLastSnapshotAndRebuildRequestsCoalesce() throws Exception {
        QuarkusTransaction.requiringNew().run(()->{
            var report=em.find(OperationalReport.class,"events");if(report==null){report=new OperationalReport();report.name="events";em.persist(report);}
            report.startedAt=Instant.now().minusSeconds(600);report.generatedAt=report.startedAt;report.sourceToken="old";
            report.rows=List.of(Map.of("id","stale-marker","label","Last committed view"));
        });
        admin().get("/api/reports/events").then().statusCode(200).body("stale",equalTo(true)).body("rows[0].label",equalTo("Last committed view"));
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            var first=executor.submit(()->admin().post("/api/reports/events/rebuild").then().statusCode(202).extract().path("state"));
            var second=executor.submit(()->admin().post("/api/reports/events/rebuild").then().statusCode(202).extract().path("state"));
            assertEquals("pending",first.get(5,TimeUnit.SECONDS));assertEquals("pending",second.get(5,TimeUnit.SECONDS));
        }
        assertEquals(1L,QuarkusTransaction.requiringNew().call(()->((Number)em.createNativeQuery("select count(*) from report_rebuild_jobs where name='events'").getSingleResult()).longValue()));
        admin().get("/api/reports/events").then().statusCode(200).body("rows[0].label",equalTo("Last committed view"));
    }

    @Test void sqlReportFiltersPagesTotalsAndPrivacyApplyBeforePagination() {
        UUID[] ids=QuarkusTransaction.requiringNew().call(()->{
            var viewer=user("Report reader");viewer.setRoles(List.of(DomainEnums.UserRole.warehouse_crew));
            var owner=user("Private owner");var policy=new InventoryAccessPolicy();policy.owner=owner;em.persist(policy);
            var publicItem=new Item();publicItem.name="Public report item";publicItem.sku="PUBLIC-"+UUID.randomUUID();publicItem.category="Filter review";em.persist(publicItem);
            var privateItem=new Item();privateItem.name="SECRET report item";privateItem.sku="PRIVATE-"+UUID.randomUUID();privateItem.category="Filter review";privateItem.accessPolicy=policy;em.persist(privateItem);
            var privateLocation=new StorageLocation();privateLocation.name="SECRET report location";var locationPolicy=new InventoryAccessPolicy();locationPolicy.owner=owner;em.persist(locationPolicy);privateLocation.accessPolicy=locationPolicy;em.persist(privateLocation);
            var report=em.find(OperationalReport.class,"movements");if(report==null){report=new OperationalReport();report.name="movements";em.persist(report);}
            var rows=new ArrayList<Map<String,Object>>();
            for(int i=0;i<4;i++) {var row=new HashMap<String,Object>();row.put("id","row-"+i);row.put("itemId",(i==2?privateItem:publicItem).id.toString());row.put("category","Filter review");row.put("date",org.ash.inventory.platform.api.EpochTime.millis(LocalDate.of(2030,1,i+1)));row.put("month","2030-01");row.put("status","consumed");row.put("quantity",i+2);row.put("label",i==0?"100%_literal":"ordinary");if(i==3)row.put("locationId",privateLocation.id.toString());rows.add(row);}
            report.rows=rows;report.generatedAt=Instant.now();report.startedAt=report.generatedAt;report.sourceToken="fixture";
            return new UUID[]{viewer.id,publicItem.id};
        });
        QuarkusTransaction.requiringNew().run(()->{
            var viewer=em.find(UserAccount.class,ids[0]);
            var first=reportRows.rows("movements",Map.of("category","Filter review"),viewer.id,0,1);
            var second=reportRows.rows("movements",Map.of(),viewer.id,1,1);
            assertEquals(2,first.total());assertEquals("row-0",first.rows().getFirst().get("id"));assertEquals("row-1",second.rows().getFirst().get("id"));
            var filtered=reportRows.rows("movements",Map.of("itemId",ids[1].toString(),"from","1893456000000","to","1893542400000","status","consumed","search","%_"),viewer.id,0,100);
            assertEquals(1,filtered.total());assertEquals(2,((Number)filtered.monthlyTotals().getFirst().get("quantity")).intValue());
            assertEquals(5,((Number)reportRows.rows("movements",Map.of("itemId",ids[1].toString()),viewer.id,0,100).monthlyTotals().getFirst().get("quantity")).intValue());
            assertThrows(org.ash.inventory.platform.api.ApiException.class,()->reportRows.rows("movements",Map.of("unsupported","x"),viewer.id,0,100));
        });
    }

    @Test @TestTransaction void retentionPurgesOnlyExpiredTransientRowsAndOldUnlinkedAttendees() {
        var person=user("Retention linked person");
        var sent=new Notification();sent.recipientId=person.id;sent.type="retention-fixture";sent.deliveryStatus="sent";sent.createdAt=Instant.now().minus(Duration.ofDays(181));em.persist(sent);
        var pending=new Notification();pending.recipientId=person.id;pending.type="retention-fixture";pending.createdAt=sent.createdAt;em.persist(pending);
        var reminder=new ActionReminder();reminder.user=person;reminder.actionKey="retention-fixture";em.persist(reminder);
        var oldEvent=new EventOccurrence();oldEvent.eventType="DE";oldEvent.name="Old retention event";oldEvent.startDate=LocalDate.now().minusDays(800);oldEvent.endDate=oldEvent.startDate;em.persist(oldEvent);
        var unlinked=new EventPerson();unlinked.name="Old unlinked name";em.persist(unlinked);
        var linked=new EventPerson();linked.name="Linked name";linked.user=person;em.persist(linked);
        for(var attendeePerson:List.of(unlinked,linked)){var attendee=new EventAttendee();attendee.event=oldEvent;attendee.person=attendeePerson;attendee.notes="Private notes";em.persist(attendee);}
        em.flush();em.createNativeQuery("update action_reminders set updated_at=(extract(epoch from now()-interval '181 days')*1000)::bigint where id=:id").setParameter("id",reminder.id).executeUpdate();
        retention.purge();em.clear();
        assertNull(em.find(Notification.class,sent.id));assertNotNull(em.find(Notification.class,pending.id));assertNull(em.find(ActionReminder.class,reminder.id));
        assertTrue(em.find(EventPerson.class,unlinked.id).name.startsWith("Former attendee "));assertEquals("Linked name",em.find(EventPerson.class,linked.id).name);
        assertNull(em.createQuery("select a.notes from EventAttendee a where a.person.id=:id",String.class).setParameter("id",unlinked.id).getSingleResult());
    }

    @Test void copiedFactionDraftPreservesAssemblyAndLooseItemGroups() {
        String id=item("Copy grouping component",false,0);
        String assembly=admin().body(Map.of("name","Copy group "+UUID.randomUUID(),"itemQuantities",Map.of(id,2))).post("/api/assemblies").then().statusCode(200).extract().path("id");
        String source=admin().body(Map.of("eventType","DE","faction","Copy group "+UUID.randomUUID(),"eventDate",2051222400000L,"requestedQuantities",Map.of(id,1),"requestedAssemblyQuantities",Map.of(assembly,3)))
                .post("/api/orders/faction").then().statusCode(200).extract().path("id");
        String event=admin().body(Map.of("name","Copy target","eventType","DE","startDate",2082758400000L)).post("/api/events").then().statusCode(200).extract().path("id");
        admin().body(Map.of("sourceOrderId",source,"eventId",event,"commandId",UUID.randomUUID().toString())).post("/api/order-copies").then().statusCode(200)
                .body("requestedQuantities."+id,equalTo(1)).body("requestedAssemblyQuantities."+assembly,equalTo(3)).body("lines.findAll { it.sourceAssemblyId=='"+assembly+"' }.requestedQuantity",hasItem(6));
    }

    @Test @TestTransaction void nullWarningWindowIsUnknownInDigestAndAttentionQueries() {
        var recipient=user("Unknown-window recipient");recipient.setRoles(List.of(DomainEnums.UserRole.warehouse_crew));
        var item=new Item();item.name="Unknown-window fixture";item.category="Follow-up";item.sku="WINDOW-"+UUID.randomUUID();em.persist(item);
        var schedule=new MaintenanceSchedule();schedule.item=item;schedule.maintenanceType=DomainEnums.MaintenanceType.dguv_v3;
        schedule.intervalType=DomainEnums.MaintenanceIntervalType.date;schedule.intervalValue=java.math.BigDecimal.TEN;schedule.nextDueAt=Instant.now().plus(Duration.ofDays(365));em.persist(schedule);em.flush();
        // The baseline normally prevents this state; exercise defensive parity in a rolled-back transaction.
        em.createNativeQuery("alter table maintenance_schedules alter column warning_window drop not null").executeUpdate();
        em.createNativeQuery("update maintenance_schedules set warning_window=null where id=:id").setParameter("id",schedule.id).executeUpdate();
        assertEquals(Boolean.TRUE,em.createNativeQuery("select inventory_maintenance_attention(:id)").setParameter("id",item.id).getSingleResult());
        notificationTasks.digest();
        assertEquals(1L,em.createQuery("select count(n) from Notification n where n.recipientId=:user and n.type='action_digest'",Long.class).setParameter("user",recipient.id).getSingleResult());
        assertEquals(MaintenancePolicy.Status.unknown,MaintenancePolicy.status(new MaintenancePolicy.Facts(null,DomainEnums.MaintenanceIntervalType.date,schedule.nextDueAt,null,null),Instant.now(),null));
    }

    @Test void activeSseConnectionClosesAfterLocalAccountDeactivation() throws Exception {
        String person=actor("sse","read_only").get("/api/auth/me").then().extract().path("id");
        var request=java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://localhost:"+io.restassured.RestAssured.port+"/api/events/stream"))
                .header("X-Actor-Id","followup-sse").header("X-Actor-Role","read_only").header("Accept","text/event-stream").timeout(Duration.ofSeconds(20)).build();
        try(var client=java.net.http.HttpClient.newHttpClient();var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            var response=client.sendAsync(request,java.net.http.HttpResponse.BodyHandlers.ofInputStream()).get(5,TimeUnit.SECONDS);
            assertEquals(200,response.statusCode());
            try(var body=response.body();var lines=new java.io.BufferedReader(new java.io.InputStreamReader(body))) {
                var first=executor.submit(()->{String line;while((line=lines.readLine())!=null)if(line.startsWith("data:"))return line;return null;});
                assertNotNull(first.get(5,TimeUnit.SECONDS));
                QuarkusTransaction.requiringNew().run(()->em.createNativeQuery("update app_users set active=false where id=:id").setParameter("id",UUID.fromString(person)).executeUpdate());
                var ended=executor.submit(()->{try{while(lines.readLine()!=null){}return true;}catch(java.io.IOException closed){return false;}});
                assertTrue(ended.get(15,TimeUnit.SECONDS));
            }
        }
    }
}
