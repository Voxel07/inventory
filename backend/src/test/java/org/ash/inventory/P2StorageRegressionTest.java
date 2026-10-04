package org.ash.inventory;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.TestTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.*;
import org.ash.inventory.resource.ApiMapper;
import org.ash.inventory.service.*;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.time.*;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest @TestProfile(StorageQueryRegressionTest.QueryStatistics.class)
class P2StorageRegressionTest {
    @Inject EntityManager em;
    @Inject ActorService actors;
    @Inject StockFactsOrm facts;
    @Inject InventoryOperationsService inventory;
    @Inject PlanningStockService planningStocks;
    @Inject OperationsOrm operations;
    @Inject CustodyOrm custody;
    @Inject MaintenanceEvaluationService maintenance;
    @Inject InventoryAccessService access;
    @Inject ApiMapper mapper;
    @Inject SourceRevisionOrm revisions;
    @Inject SnapshotProbe probe;
    @Inject CatalogService catalog;
    @Inject ApiQueryService queries;
    @Inject OperationalReportService reports;
    @Inject org.ash.inventory.resource.CatalogResponseCache factionCache;
    @Inject com.fasterxml.jackson.databind.ObjectMapper json;
    private org.hibernate.stat.Statistics stats() { return em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics(); }
    private UserAccount person() {
        var p = new UserAccount(); p.externalSubject = UUID.randomUUID().toString(); p.name = "P2 person";
        p.role = DomainEnums.UserRole.read_only; em.persist(p); return p;
    }
    private Item item() {
        var i = new Item(); i.sku = UUID.randomUUID().toString(); i.name = "P2 item"; i.category = "P2"; em.persist(i); return i;
    }
    private StockTransaction tx(Item i, UserAccount u, DomainEnums.TransactionType type, int quantity, boolean loss) {
        var t = new StockTransaction(); t.item = i; t.user = u; t.type = type; t.quantity = quantity; t.custodyWriteOff = loss; em.persist(t); return t;
    }
    private GeneralOrder order(Item i, UserAccount u, int reserved) {
        var o = new GeneralOrder(); o.name = "P2 order"; o.purpose = "P2"; o.createdBy = u; o.status = "ready";
        o.preparedQuantities.put(i.id.toString(), reserved); em.persist(o); return o;
    }
    @Test @TestTransaction
    void stockFactsUseOneStatementAndPreserveCustodyLossAndJsonReservations() {
        var user = person(); var item = item(); var other = item();
        tx(item, user, DomainEnums.TransactionType.checkout, 10, false);
        tx(item, user, DomainEnums.TransactionType.checkin, 2, false);
        tx(item, user, DomainEnums.TransactionType.written_off, 3, true);
        tx(item, user, DomainEnums.TransactionType.written_off, 4, false);
        var d = new DamageReport(); d.item = item; d.reporter = user; d.quantity = 5; d.repairedQuantity = 1;
        d.description = "P2 damage"; d.severity = DomainEnums.DamageSeverity.low; em.persist(d);
        order(item, user, 6); order(other, user, 80);
        var member = new MemberRequest(); member.item = item; member.requester = user; member.kind = "damage";
        member.quantity = 1; member.notes = "P2"; member.commandId = UUID.randomUUID(); em.persist(member);
        em.flush(); stats().clear();
        var snapshot = facts.load(List.of(item.id));
        assertEquals(1, stats().getPrepareStatementCount());
        assertEquals(4L, snapshot.totals().get(item.id).get(DomainEnums.TransactionType.written_off));
        assertEquals(3L, snapshot.totals().get(item.id).get(DomainEnums.TransactionType.consumed));
        assertEquals(4L, snapshot.damage().get(item.id)); assertEquals(Map.of(item.id, 6L), snapshot.reservations());
        assertEquals(Set.of(item.id), snapshot.memberDamage());
        assertEquals(operations.transactionTotals(item), snapshot.totals().get(item.id));
        assertEquals(operations.activeReservationQuantities(List.of(item.id)), snapshot.reservations());
        assertEquals(inventory.readStock(List.of(item)).get(item.id).physical(), planningStocks.load(List.of(item)).get(item.id).physical());
        stats().clear(); assertTrue(facts.load(List.of()).totals().isEmpty()); assertEquals(0, stats().getPrepareStatementCount());
    }
    @Test @TestTransaction
    void policyMappingUsesTwoScalarBatchesWithoutMemberHydration() {
        var actor = actors.current(); var group = new InventoryAccessGroup(); group.name = "P2 " + UUID.randomUUID();
        group.members.add(actor); em.persist(group);
        var policies = new ArrayList<UUID>();
        for (int n = 0; n < 25; n++) {
            var policy = new InventoryAccessPolicy(); policy.owner = person(); em.persist(policy); policies.add(policy.id);
            var grant = new InventoryAccessGrant(); grant.policy = policy; grant.group = group; grant.canEdit = n % 2 == 0; em.persist(grant);
        }
        em.flush(); stats().clear(); var views = access.views(policies);
        assertEquals(2, stats().getPrepareStatementCount()); assertEquals(0, stats().getEntityLoadCount());
        assertEquals(25, views.size()); assertTrue(views.values().stream().allMatch(v -> v.sources().stream().anyMatch(s -> s.kind().equals("group"))));
        group.members.clear(); em.flush();
        assertTrue(access.views(policies).values().stream().allMatch(v -> v.sources().stream().noneMatch(s -> s.kind().equals("group"))));
    }
    @Test @TestTransaction
    void transactionDtoMappingHasNoLazyQueriesForDistinctUsersAndAssets() {
        actors.current(); var item = item();
        for (int n = 0; n < 25; n++) {
            var asset = new AssetInstance(); asset.item = item; asset.assetCode = UUID.randomUUID().toString(); em.persist(asset);
            tx(item, person(), DomainEnums.TransactionType.checkout, 1, false).assetInstance = asset;
        }
        UUID id = item.id; em.flush(); em.clear(); actors.current(); stats().clear();
        var rows = operations.transactions(id, null, null, null, null, null, 0, 100);
        assertEquals(1, stats().getPrepareStatementCount());
        rows.forEach(mapper::transaction); assertEquals(1, stats().getPrepareStatementCount()); assertEquals(25, rows.size());
    }
    @Test @TestTransaction
    void custodyAggregatesHistoryAndFiltersRecipientIncludingNullEvents() {
        var user = person(); var other = person(); var item = item();
        for (int n = 0; n < 100; n++) {
            tx(item, user, DomainEnums.TransactionType.checkout, 1, false);
            tx(item, user, DomainEnums.TransactionType.checkin, 1, false);
            tx(item, other, DomainEnums.TransactionType.added, 1000, false);
        }
        tx(item, user, DomainEnums.TransactionType.checkout, 7, false);
        tx(item, user, DomainEnums.TransactionType.written_off, 2, true);
        tx(item, user, DomainEnums.TransactionType.missing, 3, false);
        tx(item, other, DomainEnums.TransactionType.checkout, 9, false);
        em.flush(); em.clear(); stats().clear(); var rows = custody.directBalances(user.id);
        assertEquals(1, rows.size()); assertEquals(5, rows.getFirst().quantity()); assertNull(rows.getFirst().event());
        assertEquals(3, stats().getPrepareStatementCount(), "Aggregate plus two metadata batches, regardless of history length");
    }
    @Test @TestTransaction
    void maintenanceUsageCountersAreBatched() {
        var user = person(); var schedules = new ArrayList<MaintenanceSchedule>();
        for (int n = 0; n < 25; n++) {
            var item = item(); tx(item, user, DomainEnums.TransactionType.checkout, 1, false);
            var s = new MaintenanceSchedule(); s.item = item; s.intervalType = DomainEnums.MaintenanceIntervalType.usage_count;
            s.maintenanceType = DomainEnums.MaintenanceType.dguv_v3; s.intervalValue = BigDecimal.TEN; s.nextDueValue = BigDecimal.ONE;
            em.persist(s); schedules.add(s);
        }
        em.flush(); stats().clear(); var statuses = maintenance.statuses(schedules, Instant.now());
        assertEquals(1, stats().getPrepareStatementCount()); assertEquals(25, statuses.size());
        assertTrue(statuses.values().stream().allMatch(s -> s == MaintenancePolicy.Status.due));
    }
    @Test @TestTransaction
    void plainBulkCatalogPageUsesSixDomainStatements() {
        actors.current(); String prefix = "P2 page " + UUID.randomUUID();
        for (int n = 0; n < 25; n++) { var item = item(); item.name = prefix + n; }
        em.flush(); em.clear(); actors.current(); stats().clear();
        var rows = queries.projectItems(catalog.getItems(prefix, 0, 100));
        assertEquals(25, rows.size()); assertEquals(6, stats().getPrepareStatementCount());
    }
    @Test @TestTransaction
    void privateCatalogMappingHasConstantQueriesForDistinctPoliciesAndLocations() {
        actors.current(); String prefix = "P2 private " + UUID.randomUUID();
        for (int n = 0; n < 25; n++) {
            var owner = person(); var policy = new InventoryAccessPolicy(); policy.owner = owner; em.persist(policy);
            var location = new StorageLocation(); location.name = prefix + " location " + n; location.accessPolicy = policy; em.persist(location);
            var item = item(); item.name = prefix + n; item.accessPolicy = policy; item.storageLocation = location; item.returnLocation = location;
        }
        em.flush(); em.clear(); actors.current(); stats().clear();
        var rows = queries.projectItems(catalog.getItems(prefix, 0, 100));
        assertEquals(25, rows.size()); assertEquals(9, stats().getPrepareStatementCount());
        assertEquals(0, stats().getCollectionFetchCount(), "No group member collections in DTO projection");
    }
    @Test
    void warmReportReadOnlyLoadsHeaderActorAndCompactRevisions() {
        QuarkusTransaction.requiringNew().run(() -> {
            actors.current(); em.flush();
            var report = em.find(OperationalReport.class, "movements");
            if (report == null) { report = new OperationalReport(); report.name = "movements"; em.persist(report); }
            report.startedAt = Instant.now(); report.generatedAt = Instant.now(); report.sourceToken = revisions.reportToken();
            report.rows = List.of(Map.of("id", "test-row", "quantity", 5));
        });
        assertFalse(reports.read("movements", Map.of(), 0, 100).stale());
        stats().clear(); var warm = reports.read("movements", Map.of(), 0, 100);
        assertEquals(1, warm.total()); assertTrue(stats().getPrepareStatementCount() <= 3);
        assertTrue(Arrays.stream(stats().getQueries()).noneMatch(q -> q.contains("count(") || q.contains("max(")));
        QuarkusTransaction.requiringNew().run(() -> item());
        assertTrue(reports.read("movements", Map.of(), 0, 100).stale());
    }
    @Test
    void factionCacheReadsCommittedRevisionAndSharesOneSnapshotAcrossFilters() throws Exception {
        String type = UUID.randomUUID().toString();
        QuarkusTransaction.requiringNew().run(() -> {
            var f = new Faction(); f.name = "First"; f.slug = "first"; f.eventType = type; em.persist(f);
        });
        assertEquals(1, json.readTree(factionCache.factions(type)).size());
        stats().clear();
        assertEquals(1, json.readTree(factionCache.factions(" " + type + " ")).size());
        assertEquals("[]", factionCache.factions("unknown"));
        assertEquals(2, stats().getPrepareStatementCount(), "One revision read per request; filters share the cached snapshot");
        QuarkusTransaction.requiringNew().run(() -> {
            var f = new Faction(); f.name = "Second"; f.slug = "second"; f.eventType = type; em.persist(f);
        });
        assertEquals(2, json.readTree(factionCache.factions(type)).size(), "Native source trigger changes the key without an outbox eviction");
    }
    @Test
    void growingListsExposeValidatedPageBounds() {
        io.restassured.RestAssured.given().get("/api/member/requests?page=0&size=10").then().statusCode(200);
        io.restassured.RestAssured.given().get("/api/loans?page=0&size=10").then().statusCode(200);
        io.restassured.RestAssured.given().get("/api/member/requests?size=201").then().statusCode(400);
        io.restassured.RestAssured.given().get("/api/loans?page=-1").then().statusCode(400);
        io.restassured.RestAssured.given().get("/api/factions?eventType=unknown").then().statusCode(200);
    }
    @Test
    void everyReportRebuildHasACompleteFetchPlan() {
        for (var name : OperationalReportService.DEFINITIONS.keySet()) {
            reports.rebuild(name);
            assertFalse(reports.read(name, Map.of(), 0, 100).stale(), name);
        }
    }
    @Test
    void repeatableReadRetainsOneSnapshotAcrossConcurrentCommit() {
        var ids = QuarkusTransaction.requiringNew().call(() -> { var i = item(); var u = person(); tx(i, u, DomainEnums.TransactionType.checkout, 2, false); return List.of(i.id, u.id); });
        var result = probe.read(ids.getFirst(), () -> QuarkusTransaction.requiringNew().run(() ->
                tx(em.find(Item.class, ids.getFirst()), em.find(UserAccount.class, ids.get(1)), DomainEnums.TransactionType.checkout, 3, false)));
        assertEquals(List.of(2L, 2L), result);
        assertEquals(5L, QuarkusTransaction.requiringNew().call(() -> facts.load(List.of(ids.getFirst())).totals().get(ids.getFirst()).get(DomainEnums.TransactionType.checkout)));
    }
    @Test
    void revisionsChangeWithCommitAndRollbackWithSources() {
        String before = QuarkusTransaction.requiringNew().call(() -> { stats().clear(); var token = revisions.reportToken(); assertEquals(1, stats().getPrepareStatementCount()); assertEquals(0, stats().getEntityLoadCount()); return token; });
        assertThrows(io.quarkus.narayana.jta.QuarkusTransactionException.class, () -> QuarkusTransaction.requiringNew().run(() -> { item(); em.flush(); QuarkusTransaction.setRollbackOnly(); }));
        assertEquals(before, QuarkusTransaction.requiringNew().call(revisions::reportToken));
        QuarkusTransaction.requiringNew().run(() -> item());
        assertNotEquals(before, QuarkusTransaction.requiringNew().call(revisions::reportToken));
    }
}
