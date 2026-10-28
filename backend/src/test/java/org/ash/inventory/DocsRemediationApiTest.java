package org.ash.inventory;

import org.ash.inventory.notification.internal.Notification;
import org.ash.inventory.notification.internal.NotificationDeliveryService;
import org.ash.inventory.operations.internal.model.ActionReminder;
import org.ash.inventory.operations.internal.model.CustodyHandover;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.model.UserAccount;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;
import java.util.*;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
class DocsRemediationApiTest {
    @jakarta.inject.Inject org.ash.inventory.notification.api.NotificationService notices;
    @jakarta.inject.Inject org.ash.inventory.notification.api.RecipientPolicy audience;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.NotificationTaskService notificationTasks;
    @Inject EntityManager em;
    @Inject org.ash.inventory.notification.internal.NotificationDeliveryService delivery;
    private RequestSpecification actor(String id,String role){return given().contentType(ContentType.JSON).header("X-Actor-Id",id).header("X-Actor-Role",role);}
    private RequestSpecification admin(){return actor("review-admin","admin");}
    private String item(boolean privateResource,String name){return admin().body(Map.of("sku","REV-"+UUID.randomUUID(),"name",name,"category","Review","value",0,"amount",2,"privateResource",privateResource)).post("/api/items").then().statusCode(200).extract().path("id");}

    @Test void exactSkuHasItsOwnIdentityLookupAndDirectoryOmitsInactiveAccounts(){
        String sku="REV-EXACT-"+UUID.randomUUID();
        String id=admin().body(Map.of("sku",sku,"name","Exact SKU","category","Review","value",0)).post("/api/items").then().statusCode(200).extract().path("id");
        actor("review-reader","read_only").get("/api/items/by-sku/"+sku.toLowerCase(Locale.ROOT)).then().statusCode(200).body("id",equalTo(id));
        String person=actor("review-offboard","faction_leader").get("/api/auth/me").then().statusCode(200).extract().path("id");
        long revision=admin().get("/api/users/"+person+"/lifecycle").then().statusCode(200).extract().jsonPath().getLong("revision");
        admin().body(Map.of("active",false,"revision",revision,"reason","Membership ended")).patch("/api/users/"+person+"/lifecycle").then().statusCode(204);
        actor("review-offboard","faction_leader").get("/api/auth/me").then().statusCode(403);
        admin().get("/api/access/people").then().statusCode(200).body("id",not(hasItem(person)));
        actor("review-reader","read_only").get("/api/users/"+person+"/personal-data/export").then().statusCode(403);
        byte[] data=admin().get("/api/users/"+person+"/personal-data/export").then().statusCode(200).extract().asByteArray();
        assertTrue(data.length>100);
        admin().body(Map.of("revision",revision+1,"reason","Person requested pseudonymization")).post("/api/users/"+person+"/personal-data/pseudonymize").then().statusCode(204);
        admin().get("/api/users").then().statusCode(200).body("find { it.id=='"+person+"' }.email",equalTo(""));
    }

    @Test void privateInboxTasksRetainTypedAuthorizationAndOfferedItemsCannotBecomeFreelyAvailable(){
        String id=admin().body(Map.of("sku","REV-LOT-"+UUID.randomUUID(),"name","Secret expiring review material","category","Review","value",0,"amount",0,"trackingMode","lot_tracked","privateResource",true)).post("/api/items").then().statusCode(200).extract().path("id");
        admin().body(Map.of("itemId",id,"lotNumber","SECRET-REV-LOT","expiryDate",1792540800000L,"status","available"))
                .post("/api/inventory-lots").then().statusCode(201);
        actor("review-warehouse","warehouse_crew").get("/api/action-inbox").then().statusCode(200)
                .body("title",not(hasItem("Secret expiring review material"))).body("detail",not(hasItem("SECRET-REV-LOT")));
        admin().get("/api/action-inbox").then().statusCode(200).body("title",hasItem("Secret expiring review material"));
        var access=admin().get("/api/access/items/"+id).then().statusCode(200).extract().jsonPath();
        admin().body(Map.of("revision",access.getLong("revision"),"grants",List.of(),"publicUse",true,"reason","Offer with explicit commitments"))
                .put("/api/access/items/"+id).then().statusCode(200);
        var profile=admin().get("/api/items/"+id+"/equipment").then().statusCode(200).extract().jsonPath();
        admin().body(Map.of("revision",profile.getLong("revision"),"ownershipType","organization","availabilityPolicy","available","reason","Attempt unrestricted profile"))
                .put("/api/items/"+id+"/equipment").then().statusCode(400);
    }

    @Test void directMovementReversalIsLinkedIdempotentAndHistoryCannotBeEdited(){
        String id=item(false,"Review reversal");
        String tx=admin().body(Map.of("itemId",id,"transactionType","adjusted","quantityChanged",3,"reason","Mistaken addition"))
                .post("/api/transactions").then().statusCode(200).extract().path("id");
        var input=Map.of("commandId",UUID.randomUUID().toString(),"reason","Correct mistaken addition");
        actor("review-warehouse","warehouse_crew").body(input).post("/api/transactions/"+tx+"/reversal").then().statusCode(403);
        String reversal=admin().body(input).post("/api/transactions/"+tx+"/reversal").then().statusCode(200).body("reversesId",equalTo(tx)).body("quantityChanged",equalTo(-3)).extract().path("id");
        admin().body(input).post("/api/transactions/"+tx+"/reversal").then().statusCode(200).body("id",equalTo(reversal));
        admin().get("/api/items/"+id).then().statusCode(200).body("stock.onHand",equalTo(2));
        assertThrows(RuntimeException.class,()->QuarkusTransaction.requiringNew().run(()->em.createNativeQuery("update stock_transactions set quantity=999 where id=:id").setParameter("id",UUID.fromString(tx)).executeUpdate()));
        assertThrows(RuntimeException.class,()->QuarkusTransaction.requiringNew().run(()->em.createNativeQuery("delete from stock_transactions where id=:id").setParameter("id",UUID.fromString(tx)).executeUpdate()));
    }

    @Test void deadlinesApplyToNewOrdersAndCopyCreatesAnIndependentDraft(){
        String id=item(false,"Review deadline");
        String event=admin().body(Map.of("name","Review event","eventType","DE","startDate",1935360000000L,"orderDeadline",1577836800000L))
                .post("/api/events").then().statusCode(200).extract().path("id");
        admin().body(Map.of("name","Late order","purpose","Review","eventOccurrenceId",event,"requestedQuantities",Map.of(id,1))).post("/api/orders/general").then().statusCode(409);
        String source=admin().body(Map.of("name","Source","purpose","Review","requestedQuantities",Map.of(id,1))).post("/api/orders/general").then().statusCode(200).extract().path("id");
        String target=admin().body(Map.of("name","Review open event","eventType","DE","startDate",1966982400000L)).post("/api/events").then().statusCode(200).extract().path("id");
        admin().body(Map.of("sourceOrderId",source,"eventId",target,"commandId",UUID.randomUUID().toString())).post("/api/order-copies").then().statusCode(200)
                .body("id",not(equalTo(source))).body("status",equalTo("draft")).body("requestedQuantities."+id,equalTo(1));
    }

    @Test void maintenanceAttentionUsesLiveMetersAndCategoryChangesRetireOnlyGeneratedSchedules(){
        String id=item(false,"Review maintenance filter");
        String healthy=admin().body(Map.of("itemId",id,"maintenanceType","generator_service","intervalType","operating_hours","intervalValue",100,"nextDueValue",100,"warningWindow",10))
                .post("/api/maintenance-schedules").then().statusCode(201).extract().path("id");
        admin().get("/api/items?maintenanceAttention=true&id="+id).then().statusCode(200).body("size()",equalTo(0));
        QuarkusTransaction.requiringNew().run(()->em.createNativeQuery("update items set current_operating_hours=95 where id=:id").setParameter("id",UUID.fromString(id)).executeUpdate());
        admin().get("/api/items?maintenanceAttention=true&id="+id).then().statusCode(200).body("id",hasItem(id));
        String category="Review category "+UUID.randomUUID();
        admin().body(Map.of("category",category,"intervalDays",180)).put("/api/category-maintenance").then().statusCode(200);
        admin().body(Map.of("sku","REV-SERIAL-"+UUID.randomUUID(),"name","Review serialized calendar","category",category,"value",0,"trackingMode","serialized","amount",2))
                .post("/api/items").then().statusCode(200).body("nextMaintenanceDue",notNullValue());
        String sku=admin().get("/api/items/"+id).then().statusCode(200).extract().path("sku");
        admin().body(Map.of("sku",sku,"name","Review maintenance filter","category",category,"value",0)).patch("/api/items/"+id).then().statusCode(200);
        admin().get("/api/maintenance-schedules?itemId="+id).then().statusCode(200).body("findAll { it.active }.size()",equalTo(2));
        admin().body(Map.of("sku",sku,"name","Review maintenance filter","category","Review without default","value",0)).patch("/api/items/"+id).then().statusCode(200);
        admin().get("/api/maintenance-schedules?itemId="+id).then().statusCode(200).body("findAll { it.active }.id",equalTo(List.of(healthy)));
    }

    @Test void handoverAttestationIsExplicitBoundAndIdempotent(){
        String source=admin().body(Map.of("name","Evidence source","purpose","Review")).post("/api/orders/general").then().statusCode(200).extract().path("id");
        String person=admin().get("/api/auth/me").then().extract().path("id");
        UUID handover=QuarkusTransaction.requiringNew().call(()->{
            var value=new org.ash.inventory.operations.internal.model.CustodyHandover();value.order=em.getReference(org.ash.inventory.operations.internal.model.InventoryOrder.class,UUID.fromString(source));
            value.marshal=em.getReference(org.ash.inventory.operations.internal.model.UserAccount.class,UUID.fromString(person));value.collectorName="Review collector";
            value.type=org.ash.inventory.operations.internal.model.DomainEnums.HandoverType.checkout;value.handoverCode="REVIEW-"+UUID.randomUUID();em.persist(value);return value.id;
        });
        var input=Map.of("commandId",UUID.randomUUID().toString(),"conditionConfirmed",true,"conditionNotes","Cases dry; count checked with collector");
        actor("review-reader","read_only").body(input).post("/api/handovers/"+handover+"/evidence").then().statusCode(403);
        String id=admin().body(input).post("/api/handovers/"+handover+"/evidence").then().statusCode(200).body("conditionConfirmed",equalTo(true)).extract().path("id");
        admin().body(input).post("/api/handovers/"+handover+"/evidence").then().statusCode(200).body("id",equalTo(id));
        var changed=new HashMap<String,Object>(input);changed.put("conditionNotes","Different evidence");
        admin().body(changed).post("/api/handovers/"+handover+"/evidence").then().statusCode(409);
        admin().get("/api/handovers?orderId="+source).then().statusCode(200).body("[0].evidence.size()",equalTo(1));
    }

    @Test void deliverySkipsIneligibleRecipientsAndHonorsItsLeaseWithoutExternalMessages(){
        String inactive=actor("review-inactive-delivery-"+UUID.randomUUID(),"read_only").get("/api/auth/me").then().extract().path("id");
        String active=actor("review-active-delivery-"+UUID.randomUUID(),"read_only").get("/api/auth/me").then().extract().path("id");
        var ids=QuarkusTransaction.requiringNew().call(()->{
            var disabled=em.find(org.ash.inventory.operations.internal.model.UserAccount.class,UUID.fromString(inactive));disabled.active=false;
            var enabled=em.find(org.ash.inventory.operations.internal.model.UserAccount.class,UUID.fromString(active));enabled.email="delivery-fixture@example.invalid";
            var skipped=new org.ash.inventory.notification.internal.Notification();skipped.recipientId=disabled.id;skipped.type="action_reminder";skipped.createdAt=java.time.Instant.EPOCH;em.persist(skipped);
            var ready=new org.ash.inventory.notification.internal.Notification();ready.recipientId=enabled.id;ready.type="action_reminder";ready.createdAt=java.time.Instant.EPOCH.plusSeconds(1);em.persist(ready);
            return List.of(skipped.id,ready.id);
        });
        var ineligible=notices.claim();assertNotNull(ineligible);assertFalse(audience.resolve(ineligible.recipientId(),ineligible.orderId(),ineligible.itemId()).allowed());
        notices.finish(ineligible,org.ash.inventory.notification.api.NotificationService.Outcome.SKIPPED,java.util.Set.of());
        var claimed=notices.claim();assertNotNull(claimed);assertEquals(ids.get(1),claimed.id());
        QuarkusTransaction.requiringNew().run(()->assertEquals("skipped",em.find(org.ash.inventory.notification.internal.Notification.class,ids.getFirst()).deliveryStatus));
        notices.finish(new org.ash.inventory.notification.api.NotificationService.Delivery(claimed.id(),UUID.randomUUID(),claimed.recipientId(),claimed.orderId(),claimed.itemId(),java.util.Set.of(),claimed.type(),claimed.payload()),org.ash.inventory.notification.api.NotificationService.Outcome.SENT,java.util.Set.of());
        QuarkusTransaction.requiringNew().run(()->assertEquals("sending",em.find(org.ash.inventory.notification.internal.Notification.class,claimed.id()).deliveryStatus));
        notices.finish(claimed,org.ash.inventory.notification.api.NotificationService.Outcome.SENT,java.util.Set.of());
        QuarkusTransaction.requiringNew().run(()->{
            var row=em.find(org.ash.inventory.notification.internal.Notification.class,claimed.id());assertEquals("sent",row.deliveryStatus);em.remove(row);
        });
        assertDoesNotThrow(()->notices.finish(claimed,org.ash.inventory.notification.api.NotificationService.Outcome.SENT,java.util.Set.of()));
    }

    @Test void scheduledRemindersAreGenericAndDigestSqlExecutes(){
        String subject="review-reminder-"+UUID.randomUUID();
        String person=actor(subject,"faction_leader").get("/api/auth/me").then().extract().path("id");
        QuarkusTransaction.requiringNew().run(()->{
            var reminder=new org.ash.inventory.operations.internal.model.ActionReminder();reminder.user=em.getReference(org.ash.inventory.operations.internal.model.UserAccount.class,UUID.fromString(person));
            reminder.actionKey="lot:"+UUID.randomUUID();reminder.remindAt=java.time.Instant.now().minusSeconds(60);em.persist(reminder);
        });
        notificationTasks.reminders();notificationTasks.reminders();notificationTasks.digest();
        actor(subject,"faction_leader").get("/api/notifications").then().statusCode(200)
                .body("findAll { it.type=='action_reminder' }.size()",equalTo(1)).body("find { it.type=='action_reminder' }.payload.path",equalTo("/"))
                .body("find { it.type=='action_reminder' }.payload.itemId",nullValue());
    }

    private Map<String,Object> command(String type,Map<String,Object> payload){return Map.of("actions",List.of(Map.of("idempotencyKey",UUID.randomUUID().toString(),"type",type,"payload",payload)));}
    @Test void blindCountAndTransferReceiptReplayWithoutDuplicateEffects(){
        String source=TestLocations.section(()->admin(),Map.of("name","Review offline source "+UUID.randomUUID()));
        String target=TestLocations.section(()->admin(),Map.of("name","Review offline destination "+UUID.randomUUID()));
        String item=admin().body(Map.of("sku","REV-FIELD-"+UUID.randomUUID(),"name","Field replay","category","Review","value",0,"amount",2,"storageLocation",source))
                .post("/api/items").then().statusCode(200).extract().path("id");
        var count=admin().body(Map.of("locationId",source,"itemId",item,"blindCount",true)).post("/api/inventory-counts").then().statusCode(201).extract().jsonPath();
        String countId=count.getString("id"),line=count.getString("lines[0].id");
        admin().body(Map.of()).post("/api/inventory-counts/"+countId+"/start").then().statusCode(200).body("lines[0].expectedQuantity",nullValue());
        var submission=command("count.submit",Map.of("countId",countId,"input",Map.of("lines",List.of(Map.of("lineId",line,"quantity",2)))));
        admin().body(submission).post("/api/sync").then().statusCode(200).body("results[0].status",equalTo("applied"));
        admin().body(submission).post("/api/sync").then().statusCode(200).body("results[0].status",equalTo("applied"));
        var transfer=admin().body(Map.of("sourceLocationId",source,"destinationLocationId",target,"idempotencyKey",UUID.randomUUID().toString(),"lines",List.of(Map.of("itemId",item,"quantity",1))))
                .post("/api/transfers").then().statusCode(201).extract().jsonPath();
        String transferId=transfer.getString("id"),transferLine=transfer.getString("lines[0].id");
        admin().body(Map.of("idempotencyKey",UUID.randomUUID().toString())).post("/api/transfers/"+transferId+"/dispatch").then().statusCode(200);
        var receipt=command("transfer.receive",Map.of("transferId",transferId,"input",Map.of("idempotencyKey",UUID.randomUUID().toString(),"lines",List.of(Map.of("transferLineId",transferLine,"receivedQuantity",1,"discrepancyQuantity",0)))));
        admin().body(receipt).post("/api/sync").then().statusCode(200).body("results[0].status",equalTo("applied"));
        admin().body(receipt).post("/api/sync").then().statusCode(200).body("results[0].status",equalTo("applied"));
        admin().get("/api/items/"+item).then().statusCode(200).body("stock.onHand",equalTo(2));
    }

    @Test void photoFreeMemberReturnAndAcceptanceReplayKeepCustodyBalanced(){
        String id=item(false,"Review field return");
        admin().body(Map.of("itemId",id,"transactionType","checkout","quantityChanged",1,"reason","Review field checkout"))
                .post("/api/transactions").then().statusCode(200);
        String custody=admin().get("/api/member/custody").then().statusCode(200).extract().path("find { it.itemId=='"+id+"' }.key");
        var submission=command("member.return",Map.of("custodyKey",custody,"quantity",1,"commandId",UUID.randomUUID().toString(),"notes","Photo-free return"));
        String returned=admin().body(submission).post("/api/sync").then().statusCode(200).body("results[0].status",equalTo("applied")).extract().path("results[0].entity.id");
        admin().body(submission).post("/api/sync").then().statusCode(200).body("results[0].entity.id",equalTo(returned));
        admin().get("/api/items/"+id).then().statusCode(200).body("stock.onHand",equalTo(1));
        var acceptance=command("return.accept",Map.of("returnId",returned,"input",Map.of("notes","Received and checked")));
        admin().body(acceptance).post("/api/sync").then().statusCode(200).body("results[0].status",equalTo("applied"));
        admin().body(acceptance).post("/api/sync").then().statusCode(200).body("results[0].status",equalTo("applied"));
        admin().get("/api/items/"+id).then().statusCode(200).body("stock.onHand",equalTo(2));
    }
}
