alter table stock_transactions add column event_occurrence_id uuid references event_occurrences(id);
create index ix_transaction_event_occurrence on stock_transactions(event_occurrence_id);
alter table general_orders add column prepared_quantities jsonb default '{}'::jsonb;
alter table general_orders add column damaged_quantities jsonb default '{}'::jsonb;
alter table general_orders add column missing_quantities jsonb default '{}'::jsonb;
alter table general_orders add column written_off_quantities jsonb default '{}'::jsonb;
alter table general_orders add column reconciled_assets jsonb default '{}'::jsonb;
create table general_order_history (
    id uuid primary key, order_id uuid not null references general_orders(id), actor_id uuid not null references app_users(id),
    occurred_at timestamp with time zone not null, action varchar(255) not null, notes varchar(4000), delta jsonb not null, command_id uuid unique
);
create index ix_general_order_history_order on general_order_history(order_id);
alter table stock_transactions add column custody_write_off boolean not null default false;
create table planning_overrides (
    id uuid primary key, created_at timestamp with time zone not null, updated_at timestamp with time zone not null,
    event_id uuid not null references event_occurrences(id), item_id uuid not null references items(id), actor_id uuid not null references app_users(id),
    quantity integer not null, reason varchar(2000) not null
);

ALTER TABLE return_submissions ADD COLUMN event_occurrence_id UUID REFERENCES event_occurrences(id);

ALTER TABLE repair_cases ADD COLUMN repaired_pending_quantity INTEGER NOT NULL DEFAULT 0;

ALTER TABLE stock_transactions ADD COLUMN lot_id UUID REFERENCES inventory_lots(id);
ALTER TABLE stock_transactions ADD COLUMN position_quantities JSONB NOT NULL DEFAULT '{}';

ALTER TABLE general_orders ADD COLUMN source_locations JSONB NOT NULL DEFAULT '{}';

ALTER TABLE damage_reports ADD COLUMN position_quantities JSONB NOT NULL DEFAULT '{}';

-- Locate legacy bulk stock that predates inventory positions. Existing positions keep their location/lot.
WITH ledger AS (
    SELECT i.id, i.storage_location_id,
        CASE WHEN count(t.id) FILTER (WHERE t.type = 'added') = 0 THEN i.base_amount ELSE 0 END
        + coalesce(sum(CASE WHEN t.type IN ('added','received','adjusted','checkin','transfer_in') THEN t.quantity
                    WHEN t.type IN ('checkout','transfer_out') OR (t.type = 'written_off' AND NOT t.custody_write_off) THEN -t.quantity ELSE 0 END),0) AS on_hand
    FROM items i LEFT JOIN stock_transactions t ON t.item_id = i.id
    WHERE i.tracking_mode <> 'serialized' AND i.storage_location_id IS NOT NULL
    GROUP BY i.id, i.storage_location_id, i.base_amount
), residual AS (
    SELECT ledger.*, greatest(0, ledger.on_hand - coalesce((SELECT sum(p.quantity_on_hand) FROM inventory_positions p WHERE p.item_id = ledger.id),0)) AS missing
    FROM ledger
)
INSERT INTO inventory_positions (id, created_at, updated_at, item_id, location_id, quantity_on_hand, quantity_reserved, quantity_damaged, quantity_quarantined, quantity_in_transit, version)
SELECT gen_random_uuid(), now(), now(), id, storage_location_id, missing, 0, 0, 0, 0, 0
FROM residual r WHERE missing > 0 AND NOT EXISTS (SELECT 1 FROM inventory_positions p WHERE p.item_id = r.id AND p.location_id = r.storage_location_id AND p.lot_id IS NULL);

-- Items with a pre-existing default position can also have unlocated legacy quantities.
WITH ledger AS (
    SELECT i.id, i.storage_location_id,
        CASE WHEN count(t.id) FILTER (WHERE t.type = 'added') = 0 THEN i.base_amount ELSE 0 END
        + coalesce(sum(CASE WHEN t.type IN ('added','received','adjusted','checkin','transfer_in') THEN t.quantity
                    WHEN t.type IN ('checkout','transfer_out') OR (t.type = 'written_off' AND NOT t.custody_write_off) THEN -t.quantity ELSE 0 END),0) AS on_hand
    FROM items i LEFT JOIN stock_transactions t ON t.item_id = i.id
    WHERE i.tracking_mode <> 'serialized' AND i.storage_location_id IS NOT NULL
    GROUP BY i.id, i.storage_location_id, i.base_amount
), residual AS (
    SELECT ledger.*, greatest(0, ledger.on_hand - coalesce((SELECT sum(p.quantity_on_hand) FROM inventory_positions p WHERE p.item_id = ledger.id),0)) AS missing FROM ledger
)
UPDATE inventory_positions p SET quantity_on_hand = p.quantity_on_hand + r.missing
FROM residual r WHERE r.missing > 0 AND p.id = (
    SELECT existing.id FROM inventory_positions existing
    WHERE existing.item_id = r.id AND existing.location_id = r.storage_location_id AND existing.lot_id IS NULL
    ORDER BY existing.id LIMIT 1
);
