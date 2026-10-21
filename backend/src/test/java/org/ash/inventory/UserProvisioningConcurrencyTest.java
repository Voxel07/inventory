package org.ash.inventory;

import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.UserAccount;
import org.ash.inventory.operations.internal.persistence.UserOrm;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

/** Parallel first requests of a new account must share one row instead of failing on uq_app_users_identity. */
@QuarkusTest
class UserProvisioningConcurrencyTest {
    @Inject UserOrm users;

    @Test
    void concurrentFirstContactSharesOneAccount() throws Exception {
        String subject = UUID.randomUUID().toString();
        var winnerInserted = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            // The winner keeps its insert uncommitted while the second request provisions the same identity.
            var winner = pool.submit(() -> QuarkusTransaction.requiringNew().call(() -> {
                var user = provision(subject);
                winnerInserted.countDown();
                Thread.sleep(500);
                return user.id;
            }));
            assertTrue(winnerInserted.await(10, TimeUnit.SECONDS));
            var loser = pool.submit(() -> QuarkusTransaction.requiringNew().call(() -> provision(subject).id));
            assertEquals(winner.get(10, TimeUnit.SECONDS), loser.get(10, TimeUnit.SECONDS));
        }
        var stored = QuarkusTransaction.requiringNew().call(() -> users.findByIdentity("test", subject));
        assertEquals(DomainEnums.UserRole.ash, stored.role);
        assertEquals(List.of(DomainEnums.UserRole.read_only, DomainEnums.UserRole.ash), stored.roles);
        assertEquals(List.of("DE:kgg"), stored.factions);
        assertNull(stored.email);
        assertNotNull(stored.createdAt);
    }

    private UserAccount provision(String subject) {
        return users.provision("test", subject, "Concurrent first contact", null,
                Set.of(DomainEnums.UserRole.ash, DomainEnums.UserRole.read_only), List.of("DE:kgg"));
    }
}
