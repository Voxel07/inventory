package org.ash.inventory;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.assertEquals;

/** Run the canonical SQL baseline through Flyway and Hibernate's production schema validation. */
@QuarkusTest
@TestProfile(BaselineSchemaTest.Baseline.class)
class BaselineSchemaTest {
    public static class Baseline implements QuarkusTestProfile {
        @Override public Map<String, String> getConfigOverrides() {
            return Map.of("quarkus.hibernate-orm.schema-management.strategy", "validate",
                    "quarkus.hibernate-orm.database.default-schema", "inventory_baseline_test",
                    "quarkus.flyway.schemas", "inventory_baseline_test",
                    "quarkus.flyway.migrate-at-start", "true");
        }
    }
    @Inject EntityManager entityManager;
    @Test @Transactional void canonicalBaselineContainsAllPrivacyTablesAndMatchesEntities() {
        assertEquals(54L, ((Number) entityManager.createNativeQuery("select count(*) from information_schema.tables where table_schema = 'inventory_baseline_test' and table_name <> 'flyway_schema_history'").getSingleResult()).longValue());
        assertEquals(0L, ((Number) entityManager.createQuery("select count(p) from InventoryAccessPolicy p").getSingleResult()).longValue());
    }
}
