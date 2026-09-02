CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE app_users (
    id UUID PRIMARY KEY,
    external_subject VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(320),
    role VARCHAR(40) NOT NULL DEFAULT 'faction_leader',
    factions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE storage_locations (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    area VARCHAR(255),
    location VARCHAR(255),
    position VARCHAR(255),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    map_zoom INTEGER NOT NULL DEFAULT 16,
    map_overlay_url VARCHAR(1000),
    overlay_bounds JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE items (
    id UUID PRIMARY KEY,
    sku VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(120) NOT NULL,
    subcategory VARCHAR(120),
    supplier VARCHAR(255),
    event_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_consumable BOOLEAN NOT NULL DEFAULT FALSE,
    base_amount INTEGER NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
    min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    unit_value_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_value_cents >= 0),
    storage_location_id UUID REFERENCES storage_locations(id),
    position_details VARCHAR(255),
    hint TEXT,
    container_size NUMERIC,
    container_count INTEGER,
    containers_opened INTEGER,
    container_remaining_pct INTEGER CHECK (container_remaining_pct BETWEEN 0 AND 100),
    maintenance_interval_days INTEGER,
    next_maintenance_due DATE,
    current_operating_hours NUMERIC NOT NULL DEFAULT 0,
    maintenance_status VARCHAR(30) NOT NULL DEFAULT 'certified',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_name_trgm ON items USING gin (name gin_trgm_ops);
CREATE INDEX idx_items_category ON items(category, subcategory);

CREATE TABLE item_images (
    id UUID PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    object_key VARCHAR(1000) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assemblies (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    hint TEXT,
    event_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE assembly_items (
    assembly_id UUID NOT NULL REFERENCES assemblies(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (assembly_id, item_id)
);

CREATE TABLE factions (
    id UUID PRIMARY KEY,
    event_type VARCHAR(20) NOT NULL,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(event_type, slug)
);
CREATE TABLE event_occurrences (
    id UUID PRIMARY KEY,
    event_type VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'planned',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);

CREATE TABLE faction_orders (
    id UUID PRIMARY KEY,
    order_code VARCHAR(80) NOT NULL UNIQUE,
    event_occurrence_id UUID NOT NULL REFERENCES event_occurrences(id),
    faction_id UUID NOT NULL REFERENCES factions(id),
    pickup_location_id UUID REFERENCES storage_locations(id),
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    created_by UUID NOT NULL REFERENCES app_users(id),
    prepared_by UUID REFERENCES app_users(id),
    ready_by UUID REFERENCES app_users(id),
    picked_up_by UUID REFERENCES app_users(id),
    returned_by UUID REFERENCES app_users(id),
    collector_name VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE faction_order_lines (
    id UUID PRIMARY KEY,
    faction_order_id UUID NOT NULL REFERENCES faction_orders(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id),
    source_assembly_id UUID REFERENCES assemblies(id),
    requested_quantity INTEGER NOT NULL CHECK (requested_quantity > 0),
    prepared_quantity INTEGER NOT NULL DEFAULT 0 CHECK (prepared_quantity >= 0),
    picked_up_quantity INTEGER NOT NULL DEFAULT 0 CHECK (picked_up_quantity >= 0),
    returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
    missing_quantity INTEGER NOT NULL DEFAULT 0 CHECK (missing_quantity >= 0),
    damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_order_line_source ON faction_order_lines(faction_order_id, item_id, COALESCE(source_assembly_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE faction_order_history (
    id BIGSERIAL PRIMARY KEY,
    faction_order_id UUID NOT NULL REFERENCES faction_orders(id),
    actor_id UUID NOT NULL REFERENCES app_users(id),
    action VARCHAR(80) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    from_status VARCHAR(40),
    to_status VARCHAR(40),
    delta_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key UUID UNIQUE,
    notes TEXT
);

CREATE TABLE stock_transactions (
    id UUID PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES items(id),
    user_id UUID NOT NULL REFERENCES app_users(id),
    type VARCHAR(30) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    faction_order_id UUID REFERENCES faction_orders(id),
    damage_report_id UUID,
    reason VARCHAR(255),
    notes TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    idempotency_key UUID UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_transactions_item ON stock_transactions(item_id, occurred_at);

CREATE TABLE damage_reports (
    id UUID PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES items(id),
    reporter_id UUID NOT NULL REFERENCES app_users(id),
    handler_id UUID REFERENCES app_users(id),
    faction_order_id UUID REFERENCES faction_orders(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    repaired_quantity INTEGER NOT NULL DEFAULT 0,
    written_off_quantity INTEGER NOT NULL DEFAULT 0,
    severity VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'reported',
    description TEXT NOT NULL,
    resolution_notes TEXT,
    idempotency_key UUID UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE stock_transactions ADD CONSTRAINT fk_stock_damage FOREIGN KEY (damage_report_id) REFERENCES damage_reports(id);

CREATE TABLE maintenance_records (
    id UUID PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES items(id),
    type VARCHAR(40) NOT NULL,
    inspector_user_id UUID NOT NULL REFERENCES app_users(id),
    performed_at TIMESTAMPTZ NOT NULL,
    next_due_at TIMESTAMPTZ,
    operating_hours NUMERIC,
    result VARCHAR(30) NOT NULL,
    certificate_number VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_results (
    idempotency_key UUID PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES app_users(id),
    operation VARCHAR(120) NOT NULL,
    entity_id UUID,
    response_status INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    recipient_id UUID NOT NULL REFERENCES app_users(id),
    faction_order_id UUID REFERENCES faction_orders(id),
    type VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'faction_order_history is append-only';
END;
$$;
CREATE TRIGGER faction_order_history_immutable
BEFORE UPDATE OR DELETE ON faction_order_history
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
