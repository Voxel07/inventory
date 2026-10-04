package org.ash.inventory.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.orm.InventoryAccessOrm;
import org.ash.inventory.resource.ApiException;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PrivacyProjectionServiceTest {
    private static class AccessFacts extends InventoryAccessOrm {
        Set<UUID> candidates;
        int calls;
        Set<UUID> privateIds = Set.of();
        Set<UUID> deniedIds = Set.of();
        @Override public ReferenceAccess referenceAccess(Set<UUID> ids, UserAccount actor) {
            candidates = ids;
            calls++;
            return new ReferenceAccess(privateIds, deniedIds);
        }
    }

    private PrivacyProjectionService service(AccessFacts facts) {
        var service = new PrivacyProjectionService();
        service.json = new ObjectMapper();
        service.orm = facts;
        service.actors = new ActorService(null, null, null, false) {
            @Override public UserAccount current() { return new UserAccount(); }
        };
        return service;
    }

    @Test void uppercaseKeysAndEmbeddedReferencesAreAuthorizedInOnePass() {
        var denied = UUID.randomUUID();
        var permitted = UUID.randomUUID();
        var facts = new AccessFacts();
        facts.privateIds = Set.of(denied, permitted);
        facts.deniedIds = Set.of(denied);
        var result = service(facts).filter(List.of(Map.of(denied.toString().toUpperCase(Locale.ROOT), 1),
                Map.of("url", "/media/" + denied.toString().toUpperCase(Locale.ROOT)),
                Map.of("id", permitted.toString()), Map.of("name", "Public")));
        assertEquals(2, result.value().size());
        assertTrue(result.containsPrivateReference());
        assertEquals(Set.of(denied, permitted), facts.candidates);
        assertEquals(1, facts.calls, "Authorization and private header reuse the same facts");
    }

    @Test void filteredPrivateRowsDoNotMarkRemainingPublicResponsePrivate() {
        var denied = UUID.randomUUID();
        var facts = new AccessFacts();
        facts.privateIds = facts.deniedIds = Set.of(denied);
        var result = service(facts).filter("[{\"id\":\"" + denied + "\"},{\"name\":\"Public\"}]");
        assertEquals(1, result.value().size());
        assertFalse(result.containsPrivateReference());
        assertEquals(1, facts.calls);
    }

    @Test void deniedSingletonRemainsNotFound() {
        var denied = UUID.randomUUID();
        var facts = new AccessFacts();
        facts.privateIds = facts.deniedIds = Set.of(denied);
        assertThrows(ApiException.class, () -> service(facts).filter(Map.of("id", denied.toString())));
    }
}
