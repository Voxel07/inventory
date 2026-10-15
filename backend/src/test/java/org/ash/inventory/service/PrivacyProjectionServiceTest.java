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
        service.actors = new ActorService(null, null, null, false, "inventory", java.util.Optional.empty()) {
            @Override public UserAccount current() { return new UserAccount(); }
        };
        return service;
    }

    @Test void typedReferencesAreAuthorizedInOnePassAndFreeTextIsIgnored() { // audit H03
        var denied = UUID.randomUUID();
        var permitted = UUID.randomUUID();
        var facts = new AccessFacts();
        facts.privateIds = Set.of(denied, permitted);
        facts.deniedIds = Set.of(denied);
        var result = service(facts).filter(List.of(Map.of(denied.toString().toUpperCase(Locale.ROOT), 1, "kept", 2),
                Map.of("notes", "Moved with " + denied + " yesterday", "url", "/media/" + denied),
                Map.of("notes", denied.toString()),
                Map.of("id", permitted.toString()), Map.of("name", "Public")), true);
        assertEquals(5, result.value().size(), "Only rows whose own id is hidden are dropped");
        assertEquals(0, result.removedRows());
        assertEquals(Map.of("kept", 2), new ObjectMapper().convertValue(result.value().get(0), Map.class));
        assertEquals("Moved with " + denied + " yesterday", result.value().get(1).get("notes").textValue());
        assertTrue(result.containsPrivateReference());
        assertEquals(Set.of(denied, permitted), facts.candidates);
        assertEquals(1, facts.calls, "Authorization and private header reuse the same facts");
    }

    @Test void deniedNestedReferencesAreRedactedWithTheirDescriptions() { // audit H03
        var denied = UUID.randomUUID();
        var facts = new AccessFacts();
        facts.privateIds = facts.deniedIds = Set.of(denied);
        var row = new LinkedHashMap<String, Object>();
        row.put("id", UUID.randomUUID().toString());
        row.put("currentLocationId", denied.toString());
        row.put("currentLocationName", "Secret shelf");
        row.put("assetIds", List.of(denied.toString(), "visible"));
        row.put("expand", Map.of("location", Map.of("id", denied.toString(), "name", "Secret shelf")));
        var result = service(facts).filter(row, true).value();
        assertTrue(result.get("currentLocationId").isNull());
        assertTrue(result.get("currentLocationName").isNull());
        assertEquals(1, result.get("assetIds").size());
        assertTrue(result.get("expand").get("location").isNull());
    }

    @Test void filteredPrivateRowsDoNotMarkRemainingPublicResponsePrivate() {
        var denied = UUID.randomUUID();
        var facts = new AccessFacts();
        facts.privateIds = facts.deniedIds = Set.of(denied);
        var result = service(facts).filter("[{\"id\":\"" + denied + "\"},{\"name\":\"Public\"}]", true);
        assertEquals(1, result.value().size());
        assertEquals(1, result.removedRows());
        assertFalse(result.containsPrivateReference());
        assertEquals(1, facts.calls);
    }

    @Test void deniedSingletonIsNotFoundOnReadButACommittedWriteIsNotTurnedInto404() {
        var denied = UUID.randomUUID();
        var facts = new AccessFacts();
        facts.privateIds = facts.deniedIds = Set.of(denied);
        assertThrows(ApiException.class, () -> service(facts).filter(Map.of("id", denied.toString()), true));
        var written = service(facts).filter(Map.of("id", denied.toString(), "name", "Secret"), false).value();
        assertEquals(denied.toString(), written.get("id").textValue());
        assertFalse(written.has("name"));
    }
}
