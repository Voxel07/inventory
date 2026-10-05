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
                    "quarkus.flyway.migrate-at-start", "true",
                    "quarkus.flyway.clean-at-start", "true", "quarkus.flyway.clean-disabled", "false");
        }
    }
    @Inject EntityManager entityManager;
    @Test @Transactional void canonicalBaselineContainsAllPrivacyTablesAndMatchesEntities() {
        assertEquals(55L, ((Number) entityManager.createNativeQuery("select count(*) from information_schema.tables where table_schema = 'inventory_baseline_test' and table_name <> 'flyway_schema_history'").getSingleResult()).longValue());
        assertEquals(0L, ((Number) entityManager.createQuery("select count(p) from InventoryAccessPolicy p").getSingleResult()).longValue());
    }
    @Test @Transactional void revisionTriggersUseTheirOwnSchema() {
        assertEquals(27L, ((Number) entityManager.createNativeQuery("select count(distinct name) from inventory_baseline_test.source_revisions").getSingleResult()).longValue());
        assertEquals(27L * 16, ((Number) entityManager.createNativeQuery("select count(*) from inventory_baseline_test.source_revisions").getSingleResult()).longValue());
        long before = ((Number) entityManager.createNativeQuery("select sum(revision) from inventory_baseline_test.source_revisions where name = 'factions'").getSingleResult()).longValue();
        var faction = new org.ash.inventory.model.Faction(); faction.eventType = "P2"; faction.name = "Baseline " + java.util.UUID.randomUUID(); faction.slug = faction.name;
        entityManager.persist(faction); entityManager.flush();
        assertEquals(before + 1, ((Number) entityManager.createNativeQuery("select sum(revision) from inventory_baseline_test.source_revisions where name = 'factions'").getSingleResult()).longValue());
    }
    @Test @Transactional void baselineContainsHotPathIndexes() {
        var names = java.util.List.of("ix_tx_item_type", "ix_tx_asset_type", "ix_tx_occurred_page",
                "ix_damage_item_status", "ix_asset_item_active", "ix_schedule_item_active",
                "ix_images_item_order", "ix_order_lines_order", "ix_purchase_lines_item", "ix_overrides_latest",
                "ix_positions_location", "ix_tx_source_location", "ix_tx_destination_location", "ix_asset_current_location",
                "ix_reservation_location", "ix_handover_lines_item", "ix_asset_code_lower", "ix_inventory_code_lower",
                "ix_items_name_trgm", "ix_items_sku_trgm", "ix_items_category_trgm", "ix_media_staged", "ix_media_staged_age");
        java.util.List<?> indexes = entityManager.createNativeQuery("select indexname from pg_indexes where schemaname = 'inventory_baseline_test' and indexname in (:names)")
                .setParameter("names", names).getResultList();
        assertEquals(java.util.Set.copyOf(names), java.util.Set.copyOf(indexes));
    }
}
