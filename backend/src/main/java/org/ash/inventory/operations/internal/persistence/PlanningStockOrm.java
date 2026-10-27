package org.ash.inventory.operations.internal.persistence;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import org.ash.inventory.platform.api.EpochTime;
import java.util.List;
import java.util.UUID;

/** One stock round trip. UNION ALL avoids multiplying independent collections in a join. */
@ApplicationScoped
public class PlanningStockOrm {
    private final EntityManager em;

    public PlanningStockOrm(EntityManager em) { this.em = em; }

    // Each branch has the same typed columns. JSON is returned as text and read once in Java.
    private static String rows(String kind, String itemId, String id, String referenceId,
            String text1, String text2, String text3, String quantity1, String quantity2,
            String quantity3, String quantity4, String decimal, String date1, String date2,
            String timestamp, String json1, String json2, String json3, String flag1, String flag2,
            String providerId, String loanId, String from) {
        String[] values = {itemId, id, referenceId, text1, text2, text3, quantity1, quantity2,
                quantity3, quantity4, decimal, date1, date2, timestamp, json1, json2, json3,
                flag1, flag2, providerId, loanId};
        String[] types = {"uuid", "uuid", "uuid", "varchar", "varchar", "varchar", "bigint", "bigint",
                "bigint", "bigint", "numeric(38,2)", "bigint", "bigint", "bigint", "varchar",
                "varchar", "varchar", "boolean", "boolean", "uuid", "uuid"};
        String[] aliases = {"item_id", "entity_id", "reference_id", "text1", "text2", "text3",
                "quantity1", "quantity2", "quantity3", "quantity4", "decimal_value", "date1", "date2",
                "timestamp_value", "json1", "json2", "json3", "flag1", "flag2", "provider_id", "loan_id"};
        var sql = new StringBuilder("select '").append(kind).append("' as kind");
        for (int index = 0; index < values.length; index++) {
            sql.append(", cast(").append(values[index] == null ? "null" : values[index])
                    .append(" as ").append(types[index]).append(") as ").append(aliases[index]);
        }
        return sql.append(" from ").append(from).toString();
    }

    private static final String SNAPSHOT_SQL = """
            with scope as (select id, inventory_role, availability_policy, access_policy_id from items where id in (:itemIds)),
            ledger as (
                select t.item_id, t.asset_instance_id, t.type, case when t.type = 'missing' and t.related_entity_type = 'inventory_transfer' then 0 else t.quantity end as quantity, t.custody_write_off, t.created_at
                from stock_transactions t join scope s on s.id = t.item_id
            )
            """ + String.join("\nunion all\n",
            rows("transaction", "t.item_id", null, null, "t.type", null, null,
                    "sum(t.quantity)", "sum(case when t.custody_write_off then t.quantity else 0 end)",
                    null, null, null, null, null, null, null, null, null, null, null, null, null,
                    "ledger t group by t.item_id, t.type"),
            rows("damage", "d.item_id", null, null, null, null, null,
                    "sum(d.quantity - d.repaired_quantity - d.written_off_quantity)",
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    "damage_reports d join scope s on s.id = d.item_id where d.status in ('reported', 'triaged', 'awaiting_repair', 'in_review', 'in_repair', 'repaired', 'verified') group by d.item_id"),
            rows("reservation", "r.item_id", null, null, null, null, null,
                    "sum(r.reserved_quantity - r.released_quantity)",
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    "stock_reservations r join scope s on s.id = r.item_id where r.status in ('active', 'partially_released') group by r.item_id"),
            rows("member_damage", "r.item_id", null, null, null, null, null,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    "member_requests r join scope s on s.id = r.item_id where r.kind = 'damage' and r.status <> 'resolved' and r.damage_report_id is null group by r.item_id"),
            rows("position", "p.item_id", null, "p.location_id", null, null, null,
                    "p.quantity_on_hand", "p.quantity_damaged", null, "p.quantity_quarantined",
                    "p.quantity_in_transit", null, null, null, null, null, null, "p.lot_id is not null",
                    "l.id is null or (l.status = 'available' and (l.expiry_date is null or l.expiry_date >= :today) and (l.best_before_date is null or l.best_before_date >= :today))",
                    null, null, "inventory_positions p join scope s on s.id = p.item_id left join inventory_lots l on l.id = p.lot_id"),
            rows("asset", "a.item_id", "a.id", "a.current_location_id",
                    "a.availability_status", "a.condition_status", null, null, null, null, null,
                    "a.operating_hours", null, null, null, null, null, null, "a.out_of_service", null, null, null,
                    "asset_instances a join scope s on s.id = a.item_id where a.active = true"),
            rows("checkout_count", "t.item_id", "t.asset_instance_id", null, null, null, null,
                    "coalesce(sum(sign(t.quantity)),0)", null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    "ledger t where t.type = 'checkout' group by t.item_id, t.asset_instance_id"),
            rows("schedule", "m.item_id", "m.asset_instance_id", null, "m.interval_type", "m.warning_window", null,
                    null, null, null, null, "m.next_due_value", null, null, "m.next_due_at",
                    null, null, null, null, null, null, null,
                    "maintenance_schedules m join scope s on s.id = m.item_id where m.active = true and m.checkout_blocking = true"),
            rows("consumed", "t.item_id", null, null, null, null, null,
                    "sum(t.quantity)", null, null, null, null, null, null, "t.created_at", null, null, null,
                    null, null, null, null,
                    "ledger t join scope s on s.id = t.item_id where t.type = 'consumed' and s.inventory_role = 'consumable' and s.availability_policy = 'commitment_required' group by t.item_id, t.created_at"),
            rows("commitment", "c.item_id", "c.id", "c.event_id", null, null, null,
                    "c.quantity", "l.collected", "l.returned", null, null,
                    "c.available_from", "c.available_until", "c.created_at",
                    "c.asset_ids", "l.collected_assets", "l.returned_assets", null, null,
                    "l.provider_location_id", "l.id",
                    "equipment_commitments c join scope s on s.id = c.item_id left join loan_arrangements l on l.commitment_id = c.id where c.cancelled = false and s.access_policy_id is null"));

    /**
     * One snapshot row, mapped once from the shared UNION ALL columns. The meaning of the generic columns depends on
     * {@code kind}; each branch above documents it by the expression it selects into the column.
     */
    public record SnapshotRow(String kind, UUID itemId, UUID entityId, UUID referenceId, String text1, String text2,
            long quantity1, long quantity2, long quantity3, long quantity4, BigDecimal decimal, LocalDate date1,
            LocalDate date2, Instant timestamp, String json1, String json2, String json3, boolean flag1, boolean flag2,
            UUID providerId, UUID loanId) {
        private static SnapshotRow of(Object[] row) {
            return new SnapshotRow((String) row[0], (UUID) row[1], (UUID) row[2], (UUID) row[3], (String) row[4],
                    (String) row[5], count(row[7]), count(row[8]), count(row[9]), count(row[10]), (BigDecimal) row[11],
                    date(row[12]), date(row[13]), row[14] == null ? null : Instant.ofEpochMilli(((Number) row[14]).longValue()),
                    (String) row[15], (String) row[16], (String) row[17], Boolean.TRUE.equals(row[18]),
                    Boolean.TRUE.equals(row[19]), (UUID) row[20], (UUID) row[21]);
        }
        private static LocalDate date(Object value) { return value == null ? null : EpochTime.date(((Number) value).longValue()); }
        private static long count(Object value) { return value == null ? 0 : ((Number) value).longValue(); }
    }

    @SuppressWarnings("unchecked")
    public List<SnapshotRow> snapshot(List<UUID> itemIds, LocalDate today) {
        if (itemIds.isEmpty()) return List.of();
        org.hibernate.query.NativeQuery<Object[]> query = em.createNativeQuery(SNAPSHOT_SQL, Object[].class)
                .unwrap(org.hibernate.query.NativeQuery.class);
        // Register in SELECT order; JDBC drivers otherwise infer UUIDs as binary values.
        String[] columns = {"kind", "item_id", "entity_id", "reference_id", "text1", "text2", "text3", "quantity1", "quantity2", "quantity3", "quantity4", "decimal_value", "date1", "date2", "timestamp_value", "json1", "json2", "json3", "flag1", "flag2", "provider_id", "loan_id"};
        Class<?>[] types = {String.class, UUID.class, UUID.class, UUID.class, String.class, String.class, String.class,
                Long.class, Long.class, Long.class, Long.class, BigDecimal.class, Long.class, Long.class,
                Long.class, String.class, String.class, String.class, Boolean.class, Boolean.class, UUID.class, UUID.class};
        for (int i = 0; i < columns.length; i++) query.addScalar(columns[i], types[i]);
        List<Object[]> rows = query.setParameter("itemIds", itemIds).setParameter("today", EpochTime.millis(today)).getResultList();
        return rows.stream().map(SnapshotRow::of).toList();
    }
}
