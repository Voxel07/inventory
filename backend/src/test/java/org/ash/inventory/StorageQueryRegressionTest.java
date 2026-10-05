package org.ash.inventory;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.security.runtime.QuarkusSecurityIdentity;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.TestTransaction;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.InventoryAccessOrm;
import org.ash.inventory.orm.UserOrm;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@QuarkusTest
@TestProfile(StorageQueryRegressionTest.QueryStatistics.class)
class StorageQueryRegressionTest {
    public static class QueryStatistics implements QuarkusTestProfile {
        @Override public Map<String, String> getConfigOverrides() {
            // Background outbox polling would contaminate global statement counts.
            return Map.of("quarkus.hibernate-orm.statistics", "true", "quarkus.scheduler.enabled", "false");
        }
    }

    @Inject EntityManager em;
    @Inject InventoryAccessOrm access;
    @Inject UserOrm users;

    private org.hibernate.stat.Statistics statistics() {
        return em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
    }

    private UserAccount person() {
        var user = new UserAccount();
        user.issuer = "test";
        user.externalSubject = UUID.randomUUID().toString();
        user.name = "Storage query regression";
        user.role = DomainEnums.UserRole.read_only;
        em.persist(user);
        return user;
    }

    private InventoryAccessPolicy policy(UserAccount owner) {
        var policy = new InventoryAccessPolicy();
        policy.owner = owner;
        em.persist(policy);
        return policy;
    }

    private Item item(InventoryAccessPolicy policy) {
        var item = new Item();
        item.sku = UUID.randomUUID().toString();
        item.name = "Query regression item";
        item.category = "test";
        item.accessPolicy = policy;
        em.persist(item);
        return item;
    }

    @Test @TestTransaction
    void responseAuthorizationHasConstantQueryCountAndHonorsRevocation() {
        var owner = person();
        var reader = person();
        var group = new InventoryAccessGroup();
        group.name = UUID.randomUUID().toString();
        group.members.add(reader);
        em.persist(group);
        var ids = new HashSet<UUID>();
        for (int i = 0; i < 30; i++) ids.add(item(policy(owner)).id);
        var personal = item(policy(owner));
        var grouped = item(policy(owner));
        var personalGrant = new InventoryAccessGrant();
        personalGrant.policy = personal.accessPolicy;
        personalGrant.user = reader;
        em.persist(personalGrant);
        var groupGrant = new InventoryAccessGrant();
        groupGrant.policy = grouped.accessPolicy;
        groupGrant.group = group;
        em.persist(groupGrant);
        ids.add(personal.id);
        ids.add(grouped.id);
        em.flush();
        em.clear();
        statistics().clear();

        var facts = access.referenceAccess(ids, reader);
        assertEquals(5, statistics().getPrepareStatementCount(), "Root existence, provenance and three resource permission queries, regardless of policy count");
        assertEquals(ids, facts.privateIds());
        assertEquals(0, statistics().getEntityLoadCount(), "Privacy classification must not hydrate policies or inventory");
        assertEquals(30, facts.deniedIds().size());
        assertFalse(facts.deniedIds().contains(personal.id));
        assertFalse(facts.deniedIds().contains(grouped.id));
        assertTrue(access.referenceAccess(ids, owner).deniedIds().isEmpty());
        statistics().clear();
        assertTrue(access.deniedReferences(reader).containsAll(facts.deniedIds()));
        assertEquals(4, statistics().getPrepareStatementCount(), "Three resource permission queries and one forward traversal");

        em.remove(em.find(InventoryAccessGrant.class, personalGrant.id));
        em.find(InventoryAccessGroup.class, group.id).members.clear();
        em.flush();
        em.clear();
        statistics().clear();
        assertEquals(ids, access.referenceAccess(ids, reader).deniedIds());
        assertEquals(5, statistics().getPrepareStatementCount(), "Revocation must be checked afresh without per-policy reads");
    }

    @Test @TestTransaction
    void scopedReverseTraversalMatchesForwardPrivacyIncludingJsonAndSharedRoots() {
        var owner = person();
        var outsider = person();
        var privateItem = item(policy(owner));
        var publicItem = item(null);
        var location = new StorageLocation();
        location.name = "Private regression location";
        location.accessPolicy = policy(outsider);
        em.persist(location);
        var asset = new AssetInstance();
        asset.item = privateItem;
        asset.assetCode = UUID.randomUUID().toString();
        em.persist(asset);
        var order = new GeneralOrder();
        order.name = "JSON privacy provenance";
        order.purpose = "regression";
        order.createdBy = owner;
        order.requestedQuantities.put(privateItem.id.toString().toUpperCase(Locale.ROOT), 1);
        order.sourceLocations.put(publicItem.id.toString(), location.id.toString());
        em.persist(order);
        em.flush();
        em.clear();

        var roots = Set.of(privateItem.id, location.id);
        var candidates = Set.of(privateItem.id, publicItem.id, location.id, asset.id, order.id, UUID.randomUUID());
        var forward = access.referenceOrigins(roots);
        var reverse = access.privateReferenceOrigins(candidates);
        for (UUID candidate : candidates) {
            var expected = new HashSet<UUID>();
            forward.forEach((root, descendants) -> { if (descendants.contains(candidate)) expected.add(root); });
            assertEquals(expected, reverse.getOrDefault(candidate, Set.of()));
        }
        assertEquals(roots, reverse.get(order.id), "A mixed aggregate inherits both private roots");
        assertTrue(access.referenceAccess(candidates, owner).deniedIds().contains(order.id));
        var policies = access.referencedPolicies(Set.of(asset.id));
        assertEquals(List.of(privateItem.accessPolicy.id), policies.stream().map(p -> p.id).toList());
        statistics().clear();
        assertTrue(access.referenceAccess(Set.of(), outsider).privateIds().isEmpty());
        assertEquals(0, statistics().getPrepareStatementCount());
    }

    private ActorService actor() {
        String subject = "actor-regression-" + UUID.randomUUID();
        var claims = Map.<String, Object>of("iss", "https://identity.example.test", "sub", subject);
        var token = new org.eclipse.microprofile.jwt.JsonWebToken() {
            public String getName() { return subject; }
            public Set<String> getClaimNames() { return claims.keySet(); }
            @SuppressWarnings("unchecked") public <T> T getClaim(String name) { return (T) claims.get(name); }
        };
        var identity = QuarkusSecurityIdentity.builder()
                .setPrincipal(token)
                .addRole("inventory_read_only").build();
        // The authenticated identity path does not need an HTTP request.
        return new ActorService(identity, null, users, false);
    }

    @Test
    void actorIsReusedWithinTransactionAndReloadedAfterTransactionOrRollback() {
        var actor = actor();
        var first = QuarkusTransaction.requiringNew().call(() -> {
            var current = actor.current();
            em.flush();
            statistics().clear();
            for (int i = 0; i < 100; i++) assertSame(current, actor.current());
            assertEquals(0, statistics().getPrepareStatementCount());
            return current;
        });
        QuarkusTransaction.requiringNew().run(() -> {
            statistics().clear();
            var reloaded = actor.current();
            assertNotSame(first, reloaded);
            assertEquals(first.id, reloaded.id);
            assertTrue(em.contains(reloaded));
            for (int i = 0; i < 100; i++) assertSame(reloaded, actor.current());
            assertEquals(1, statistics().getPrepareStatementCount(), "A new transaction reloads by ID once");
            QuarkusTransaction.requiringNew().run(() -> {
                var inner = actor.current();
                assertNotSame(reloaded, inner);
                assertTrue(em.contains(inner));
            });
            assertSame(reloaded, actor.current(), "Resuming a suspended transaction reuses its original managed actor");
        });

        var rolledBackActor = actor();
        var rolledBackId = new UUID[1];
        assertThrows(RuntimeException.class, () -> QuarkusTransaction.requiringNew().run(() -> {
            rolledBackId[0] = rolledBackActor.current().id;
            em.flush();
            throw new IllegalStateException("Simulate failed sync command");
        }));
        QuarkusTransaction.requiringNew().run(() -> {
            var recreated = rolledBackActor.current();
            assertNotEquals(rolledBackId[0], recreated.id);
            assertTrue(em.contains(recreated));
            assertSame(recreated, rolledBackActor.current());
        });
    }
}
