package org.ash.inventory;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.persistence.InventoryAccessOrm;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The set-based member scope ({@link InventoryAccessOrm#scope(String, String, UserAccount)}) must hide exactly what
 * {@code inventory_resource_visible} hides. Real orders, reservations, movements and damage come from the API; inside a
 * rolled-back transaction some items, locations and assemblies then get a policy (foreign owner, the actor's own,
 * direct grant, group grant, offered for use, inherited from a linked policy), and extra references (pickup and
 * source locations, source assemblies, assembly damage, movements on orders and damage) are wired in. Both predicates
 * are compared row by row for every kind of actor.
 */
@QuarkusTest
class MemberPrivacyScopeTest {
    @Inject EntityManager em;

    private RequestSpecification actor(String name, String role) {
        return given().contentType(ContentType.JSON).header("X-Actor-Id", "scope-" + name).header("X-Actor-Name", "scope-" + name).header("X-Actor-Role", role);
    }
    private RequestSpecification admin() { return actor("admin", "admin"); }
    private UUID person(String name, String role) {
        return UUID.fromString(actor(name, role).get("/api/auth/me").then().statusCode(200).extract().path("id"));
    }
    private String item(String location, int amount) {
        return admin().body(Map.of("sku", "SCOPE-" + UUID.randomUUID(), "name", "Scope item " + UUID.randomUUID(), "category", "Scope",
                "amount", amount, "value", 0, "storageLocation", location)).post("/api/items").then().statusCode(200).extract().path("id");
    }

    @Test void memberScopeHidesExactlyWhatTheVisibilityFunctionHides() {
        String reservedStore = TestLocations.section(this::admin, Map.of("name", "Scope reserved " + UUID.randomUUID()));
        String store = TestLocations.section(this::admin, Map.of("name", "Scope store " + UUID.randomUUID()));
        String reserved = item(reservedStore, 4), open = item(store, 4), secret = item(store, 3), shared = item(store, 3);
        String component = item(store, 2), other = item(store, 2);
        String kit = admin().body(Map.of("name", "Scope kit " + UUID.randomUUID(), "itemQuantities", Map.of(component, 1, other, 1)))
                .post("/api/assemblies").then().statusCode(200).extract().path("id");
        String event = admin().body(Map.of("eventType", "DE", "startDate", 2_400_019_200_000L + (long) (Math.random() * 10_000) * 86_400_000L))
                .post("/api/events").then().statusCode(200).extract().path("id");
        // Hidden only by its reservation once the reserved store turns private.
        String reservedOrder = order(event, Map.of(reserved, 2));
        admin().body(Map.of()).post("/api/orders/general/" + reservedOrder + "/transitions/submitted").then().statusCode(200);
        admin().body(Map.of("preparedQuantities", Map.of(reserved, 2))).post("/api/orders/general/" + reservedOrder + "/prepare").then().statusCode(200);
        String openOrder = order(event, Map.of(open, 1));                  // stays visible
        String secretOrder = order(event, Map.of(open, 1, secret, 1));     // hidden by a foreign private item
        String sharedOrder = order(event, Map.of(shared, 1));              // hidden except for the grantee
        String pickupOrder = order(event, Map.of(open, 1)), sourceOrder = order(event, Map.of(open, 1)), kitOrder = order(event, Map.of(open, 1));
        for (String item : List.of(open, secret))
            admin().body(Map.of("itemId", item, "amount", 1, "severity", "medium", "description", "Scope damage"))
                    .post("/api/damage-reports").then().statusCode(200);
        var scenario = new Scenario(UUID.fromString(reservedStore), UUID.fromString(store), UUID.fromString(open), UUID.fromString(secret),
                UUID.fromString(shared), UUID.fromString(component), UUID.fromString(kit), UUID.fromString(reservedOrder),
                UUID.fromString(secretOrder), UUID.fromString(pickupOrder), UUID.fromString(sourceOrder), UUID.fromString(kitOrder),
                List.of(UUID.fromString(openOrder), UUID.fromString(secretOrder), UUID.fromString(sharedOrder),
                        UUID.fromString(pickupOrder), UUID.fromString(sourceOrder), UUID.fromString(kitOrder)));

        Map<String, UUID> actors = new java.util.LinkedHashMap<>();
        actors.put("outsider", person("outsider", "read_only"));
        actors.put("crew", person("crew", "warehouse_crew"));
        actors.put("owner", person("owner", "faction_leader"));
        actors.put("grantee", person("grantee", "read_only"));
        actors.put("member", person("member", "ash"));
        actors.put("tenant", person("tenant", "tenant"));
        actors.put("admin", person("admin", "admin"));
        UUID stranger = person("stranger", "faction_leader");

        // The scenario only lives inside this transaction; the marker exception rolls it back after the comparison.
        var rolledBack = org.junit.jupiter.api.Assertions.assertThrows(Compared.class, () -> QuarkusTransaction.requiringNew().run(() -> {
            privatize(scenario, stranger, actors.get("owner"), actors.get("grantee"), actors.get("member"));
            for (var entry : actors.entrySet()) {
                var actor = em.find(UserAccount.class, entry.getValue());
                String who = entry.getKey();
                var orders = compare(who, "order", "select o.id from InventoryOrder o where 1=1" + InventoryAccessOrm.scope("order", "o", actor), actor);
                var damage = compare(who, "damage", "select d.id from DamageReport d where 1=1" + InventoryAccessOrm.scope("damage", "d", actor), actor);
                var movements = compare(who, "transaction", "select t.id from StockTransaction t where 1=1" + InventoryAccessOrm.scope("transaction", "t", actor), actor);
                compare(who, "transaction", "select tx.id from StockTransaction tx left join tx.sourceLocation source left join tx.destinationLocation destination where 1=1"
                        + InventoryAccessOrm.transactionScope("tx", "source", "destination", actor), actor);
                if (who.equals("outsider")) {
                    // The scenario must exercise both directions for each kind.
                    assertTrue(orders > 0 && orders < count("orders"), "outsider orders: " + orders + " of " + count("orders"));
                    assertTrue(damage > 0 && damage < count("damage_reports"), "outsider damage: " + damage + " of " + count("damage_reports"));
                    assertTrue(movements > 0 && movements < count("stock_transactions"), "outsider movements: " + movements + " of " + count("stock_transactions"));
                }
            }
            throw new Compared();
        }));
        assertTrue(rolledBack instanceof Compared);
    }

    private static final class Compared extends RuntimeException {}

    private record Scenario(UUID reservedStore, UUID store, UUID open, UUID secret, UUID shared, UUID component, UUID kit,
            UUID reservedOrder, UUID secretOrder, UUID pickupOrder, UUID sourceOrder, UUID kitOrder, List<UUID> orders) {}

    private String order(String event, Map<String, Integer> quantities) {
        return admin().body(Map.of("name", "Scope order", "purpose", "Privacy scope", "eventOccurrenceId", event, "requestedQuantities", quantities))
                .post("/api/orders/general").then().statusCode(200).extract().path("id");
    }

    private long count(String table) {
        return ((Number) em.createNativeQuery("select count(*) from " + table).getSingleResult()).longValue();
    }

    /** Compares the JPQL scope with the SQL function for one actor and returns the number of visible rows. */
    private int compare(String who, String kind, String jpql, UserAccount actor) {
        Set<UUID> scoped = new HashSet<>(InventoryAccessOrm.bind(em.createQuery(jpql, UUID.class), actor).getResultList());
        String table = switch (kind) { case "order" -> "orders"; case "damage" -> "damage_reports"; default -> "stock_transactions"; };
        @SuppressWarnings("unchecked")
        List<UUID> expected = em.createNativeQuery("select id from " + table + " where inventory_resource_visible(:kind, id, :actor, :admin, :public)")
                .setParameter("kind", kind).setParameter("actor", actor.id)
                .setParameter("admin", actor.role == org.ash.inventory.operations.internal.model.DomainEnums.UserRole.admin)
                .setParameter("public", actor.role.atLeast(org.ash.inventory.operations.internal.model.DomainEnums.UserRole.read_only))
                .getResultList();
        assertEquals(new HashSet<>(expected), scoped, who + " sees different " + kind + " rows");
        return scoped.size();
    }

    private void privatize(Scenario scenario, UUID stranger, UUID owner, UUID grantee, UUID member) {
        UUID group = UUID.randomUUID(), ancestor = UUID.randomUUID();
        sql("insert into inventory_access_groups(id, created_at, updated_at, name, revision, owner_user_id) values (:group, 0, 0, :name, 1, :stranger)",
                Map.of("group", group, "name", "Scope group " + group, "stranger", stranger));
        sql("insert into inventory_access_group_members(group_id, user_id) values (:group, :member)", Map.of("group", group, "member", member));
        sql("insert into inventory_access_policies(id, created_at, updated_at, owner_user_id, revision, public_use) values (:ancestor, 0, 0, :owner, 1, false)",
                Map.of("ancestor", ancestor, "owner", owner));
        sql("insert into inventory_access_grants(id, created_at, updated_at, policy_id, user_id, can_edit) values (gen_random_uuid(), 0, 0, :ancestor, :grantee, false)",
                Map.of("ancestor", ancestor, "grantee", grantee));
        // Every fifth item and third location and assembly get a policy; the variant cycles through all access paths.
        sql("""
                create temp table scope_private on commit drop as
                select 'items'::text kind, id, row_number() over (order by id) n from items where access_policy_id is null
                union all select 'storage_locations', id, row_number() over (order by id) from storage_locations where access_policy_id is null
                union all select 'assemblies', id, row_number() over (order by id) from assemblies where access_policy_id is null""", Map.of());
        sql("delete from scope_private where n % (case kind when 'items' then 5 else 3 end) <> 0", Map.of());
        sql("alter table scope_private add column policy uuid, add column variant int", Map.of());
        sql("update scope_private set policy = gen_random_uuid(), variant = (n / 3) % 6", Map.of());
        sql("""
                insert into inventory_access_policies(id, created_at, updated_at, owner_user_id, revision, public_use)
                select policy, 0, 0, case when variant = 1 then cast(:owner as uuid) else cast(:stranger as uuid) end, 1, variant = 4 from scope_private""",
                Map.of("owner", owner, "stranger", stranger));
        sql("""
                insert into inventory_access_grants(id, created_at, updated_at, policy_id, user_id, group_id, can_edit)
                select gen_random_uuid(), 0, 0, policy, case when variant = 2 then cast(:grantee as uuid) end, case when variant = 3 then cast(:group as uuid) end, false
                from scope_private where variant in (2, 3)""", Map.of("grantee", grantee, "group", group));
        sql("""
                insert into inventory_access_links(id, created_at, updated_at, policy_id, ancestor_policy_id)
                select gen_random_uuid(), 0, 0, policy, :ancestor from scope_private where variant = 5""", Map.of("ancestor", ancestor));
        for (String table : List.of("items", "storage_locations", "assemblies"))
            sql("update " + table + " t set access_policy_id = p.policy from scope_private p where p.kind = '" + table + "' and p.id = t.id", Map.of());
        // References the API scenario does not produce on its own, picked deterministically from existing rows.
        String pick = "(select id from %s order by id offset (abs(hashtext(%s)) %% (select count(*) from %s)) limit 1)";
        sql("update orders o set pickup_location_id = " + pick.formatted("storage_locations", "o.id::text", "storage_locations")
                + " where abs(hashtext(o.id::text)) % 5 = 0", Map.of());
        sql("update order_lines l set source_location_id = " + pick.formatted("storage_locations", "l.id::text", "storage_locations")
                + " where abs(hashtext(l.id::text)) % 10 = 0", Map.of());
        sql("update order_lines l set source_assembly_id = " + pick.formatted("assemblies", "l.id::text", "assemblies")
                + " where abs(hashtext(l.id::text)) % 10 = 1", Map.of());
        sql("create temp table scope_damage on commit drop as select * from damage_reports where item_id is not null order by id limit 20", Map.of());
        sql("update scope_damage d set id = gen_random_uuid(), idempotency_key = null, item_id = null, assembly_id = " + pick.formatted("assemblies", "d.id::text", "assemblies"), Map.of());
        sql("insert into damage_reports select * from scope_damage", Map.of());
        sql("create temp table scope_movements on commit drop as select * from stock_transactions where reverses_id is null order by id limit 300", Map.of());
        sql("update scope_movements t set id = gen_random_uuid(), idempotency_key = null, client_command_id = null,"
                + " order_id = case when abs(hashtext(t.id::text)) % 3 = 0 then " + pick.formatted("orders", "t.id::text", "orders") + " else t.order_id end,"
                + " damage_report_id = case when abs(hashtext(t.id::text)) % 3 = 1 then " + pick.formatted("damage_reports", "t.id::text", "damage_reports") + " else t.damage_report_id end,"
                + " source_location_id = case when abs(hashtext(t.id::text)) % 2 = 0 then " + pick.formatted("storage_locations", "t.id::text || 's'", "storage_locations") + " else t.source_location_id end", Map.of());
        sql("insert into stock_transactions select * from scope_movements", Map.of());
        // Explicit cases on top of the spread, so both directions exist even on an otherwise empty database.
        var orders = new java.util.ArrayList<>(scenario.orders()); orders.add(scenario.reservedOrder());
        sql("update orders set pickup_location_id = null where id in (:orders)", Map.of("orders", orders));
        sql("update order_lines set source_location_id = null, source_assembly_id = null where order_id in (:orders)", Map.of("orders", orders));
        sql("update items set access_policy_id = null where id in (select item_id from order_lines where order_id in (:orders))", Map.of("orders", orders));
        sql("update storage_locations set access_policy_id = null where id = :store", Map.of("store", scenario.store()));
        restrict("storage_locations", scenario.reservedStore(), stranger, null);
        restrict("items", scenario.secret(), stranger, null);
        restrict("items", scenario.shared(), stranger, grantee);
        restrict("items", scenario.component(), stranger, null);
        // Orders hidden by exactly one reference each.
        sql("update orders set pickup_location_id = :store where id = :order", Map.of("store", scenario.reservedStore(), "order", scenario.pickupOrder()));
        sql("update order_lines set source_location_id = :store where order_id = :order", Map.of("store", scenario.reservedStore(), "order", scenario.sourceOrder()));
        sql("update order_lines set source_assembly_id = :kit where order_id = :order", Map.of("kit", scenario.kit(), "order", scenario.kitOrder()));
        // An assembly damage report, and movements of the public item hidden by exactly one reference each.
        sql("create temp table scope_kit_damage on commit drop as select * from damage_reports where item_id = :open limit 1", Map.of("open", scenario.open()));
        sql("update scope_kit_damage set id = gen_random_uuid(), idempotency_key = null, item_id = null, assembly_id = :kit", Map.of("kit", scenario.kit()));
        sql("insert into damage_reports select * from scope_kit_damage", Map.of());
        UUID secretDamage = (UUID) em.createNativeQuery("select id from damage_reports where item_id = :secret limit 1").setParameter("secret", scenario.secret()).getSingleResult();
        String base = "select * from stock_transactions where item_id = :open and order_id is null and damage_report_id is null and reverses_id is null order by occurred_at limit 1";
        for (String change : List.of("damage_report_id = :secretDamage", "order_id = :secretOrder", "source_location_id = :reservedStore", "destination_location_id = :reservedStore")) {
            sql("create temp table scope_one on commit drop as " + base, Map.of("open", scenario.open()));
            var update = em.createNativeQuery("update scope_one set id = gen_random_uuid(), idempotency_key = null, client_command_id = null, " + change);
            if (change.contains(":secretDamage")) update.setParameter("secretDamage", secretDamage);
            if (change.contains(":secretOrder")) update.setParameter("secretOrder", scenario.secretOrder());
            if (change.contains(":reservedStore")) update.setParameter("reservedStore", scenario.reservedStore());
            update.executeUpdate();
            sql("insert into stock_transactions select * from scope_one", Map.of());
            sql("drop table scope_one", Map.of());
        }
    }

    /** Gives one resource a fresh policy owned by {@code owner}, optionally granted to {@code grantee}. */
    private void restrict(String table, UUID id, UUID owner, UUID grantee) {
        UUID policy = UUID.randomUUID();
        sql("insert into inventory_access_policies(id, created_at, updated_at, owner_user_id, revision, public_use) values (:policy, 0, 0, :owner, 1, false)",
                Map.of("policy", policy, "owner", owner));
        if (grantee != null)
            sql("insert into inventory_access_grants(id, created_at, updated_at, policy_id, user_id, can_edit) values (gen_random_uuid(), 0, 0, :policy, :grantee, false)",
                    Map.of("policy", policy, "grantee", grantee));
        sql("update " + table + " set access_policy_id = :policy where id = :id", Map.of("policy", policy, "id", id));
    }

    private void sql(String statement, Map<String, Object> parameters) {
        var query = em.createNativeQuery(statement);
        parameters.forEach(query::setParameter);
        query.executeUpdate();
    }
}
