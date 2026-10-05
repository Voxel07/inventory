-- Canonical PostgreSQL schema for a fresh disposable database.
-- Edit this baseline and the entity definitions directly; no upgrade/backfill steps.

-- Trigram indexes serve the catalog's substring search (lower(name|sku|category) like '%term%').
create extension if not exists pg_trgm;

create table app_users (
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    email varchar(255),
    issuer varchar(255) not null,
    external_subject varchar(255) not null,
    name varchar(255) not null,
    role varchar(255) not null check ((role in ('hq_admin','warehouse_crew','marshal','event_planner','maintenance_crew','faction_leader','read_only'))),
    factions jsonb not null,
    primary key (id),
    constraint uq_app_users_identity unique (issuer, external_subject)
);

create table assemblies (
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    image_object_key varchar(1024),
    description varchar(255),
    hint varchar(255),
    name varchar(255) not null,
    event_tags jsonb not null,
    primary key (id)
);

create table assembly_items (
    quantity integer not null,
    assembly_id uuid not null,
    item_id uuid not null,
    primary key (assembly_id, item_id)
);

create table asset_instances (
    active boolean not null,
    operating_hours numeric(38,2) not null,
    purchase_date date,
    purchase_price_cents integer,
    replacement_value_cents integer,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    version bigint not null,
    current_custodian_id uuid,
    current_location_id uuid,
    id uuid not null,
    item_id uuid not null,
    asset_code varchar(255) not null unique,
    availability_status varchar(255) not null check ((availability_status in ('available','reserved','staged','in_transit','in_custody','in_field','returned_pending_check','damaged','in_repair','in_maintenance','lost','written_off'))),
    condition_status varchar(255) not null check ((condition_status in ('new_condition','good','fair','damaged','unsafe','lost'))),
    manufacturer varchar(255),
    model varchar(255),
    notes varchar(255),
    serial_number varchar(255),
    service_status varchar(255) not null check ((service_status in ('certified','due_soon','overdue','in_service'))),
    primary key (id)
);

create table custody_handover_lines (
    quantity integer not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    asset_instance_id uuid,
    handover_id uuid not null,
    id uuid not null,
    item_id uuid not null,
    order_line_id uuid not null,
    condition_notes varchar(255),
    primary key (id)
);

create table custody_handovers (
    condition_confirmed boolean not null,
    created_at timestamp(6) with time zone not null,
    occurred_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    collector_id uuid,
    faction_order_id uuid not null,
    id uuid not null,
    idempotency_key uuid unique,
    location_id uuid,
    marshal_id uuid not null,
    acknowledgement_object_key varchar(255),
    collector_name varchar(255) not null,
    handover_code varchar(255) not null unique,
    handover_type varchar(255) not null check ((handover_type in ('checkout','checkin'))),
    notes varchar(255),
    primary key (id)
);

create table damage_reports (
    position_quantities JSONB NOT NULL DEFAULT '{}',
    assembly_id uuid,
    quantity integer not null,
    repaired_quantity integer not null,
    safety_impact boolean not null,
    written_off_quantity integer not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    asset_instance_id uuid,
    faction_order_id uuid,
    handler_id uuid,
    handover_id uuid,
    id uuid not null,
    idempotency_key uuid unique,
    item_id uuid ,
    reporter_id uuid not null,
    description varchar(255) not null,
    resolution_notes varchar(255),
    severity varchar(255) not null check ((severity in ('low','medium','high','critical','total_loss'))),
    status varchar(255) not null check ((status in ('reported','triaged','awaiting_repair','in_review','in_repair','repaired','verified','returned_to_service','written_off','resolved'))),
    primary key (id),
    constraint ck_damage_reports_single_target check (
    (item_id is not null and assembly_id is null)
    or (item_id is null and assembly_id is not null)
)
);

create table domain_event_outbox (
    attempt_count integer not null,
    available_at timestamp(6) with time zone not null,
    created_at timestamp(6) with time zone not null,
    occurred_at timestamp(6) with time zone not null,
    published_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone not null,
    actor_id uuid,
    aggregate_id uuid not null,
    event_id uuid not null unique,
    id uuid not null,
    idempotency_key uuid,
    last_error varchar(2000),
    aggregate_type varchar(255) not null,
    event_type varchar(255) not null,
    status varchar(255) not null check ((status in ('pending','processing','published','failed','dead_letter'))),
    payload jsonb not null,
    primary key (id)
);

create table event_occurrences (
    end_date date not null,
    start_date date not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    event_type varchar(255) not null,
    name varchar(255) not null,
    notes varchar(255),
    status varchar(255) not null,
    planned_quantities jsonb,
    used_quantities jsonb,
    primary key (id)
);

create table faction_order_history (
    id bigint generated by default as identity,
    occurred_at timestamp(6) with time zone not null,
    actor_id uuid not null,
    faction_order_id uuid not null,
    idempotency_key uuid unique,
    action varchar(255) not null,
    from_status varchar(255),
    notes varchar(255),
    to_status varchar(255),
    delta_snapshot jsonb not null,
    primary key (id)
);

create table faction_order_lines (
    allocated_quantity integer not null,
    consumed_quantity integer not null,
    damaged_quantity integer not null,
    handed_over_quantity integer not null,
    missing_quantity integer not null,
    prepared_quantity integer not null,
    requested_quantity integer not null,
    reserved_quantity integer not null,
    returned_quantity integer not null,
    written_off_quantity integer not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    faction_order_id uuid not null,
    id uuid not null,
    item_id uuid not null,
    source_assembly_id uuid,
    notes varchar(255),
    primary key (id)
);

create table faction_orders (
    pickup_latitude float(53),
    pickup_longitude float(53),
    requested_pickup_date date,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    created_by uuid not null,
    event_occurrence_id uuid not null,
    faction_id uuid not null,
    id uuid not null,
    picked_up_by uuid,
    pickup_location_id uuid,
    prepared_by uuid,
    ready_by uuid,
    returned_by uuid,
    collector_name varchar(255),
    notes varchar(255),
    order_code varchar(255) not null unique,
    status varchar(255) not null check ((status in ('draft','submitted','preparing','ready','picked_up','partially_returned','returned','closed','cancelled'))),
    primary key (id)
);

create table factions (
    is_active boolean not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    event_type varchar(255) not null,
    name varchar(255) not null,
    slug varchar(255) not null,
    primary key (id),
    -- Faction memberships from the identity provider are EVENT:slug keys.
    constraint uq_faction_event_slug unique (event_type, slug)
);

create table general_orders (
    source_locations JSONB NOT NULL DEFAULT '{}',
    reconciled_assets jsonb default '{}'::jsonb,
    written_off_quantities jsonb default '{}'::jsonb,
    missing_quantities jsonb default '{}'::jsonb,
    damaged_quantities jsonb default '{}'::jsonb,
    prepared_quantities jsonb default '{}'::jsonb,
    asset_assignments jsonb not null default '{}'::jsonb,
    consumed_quantities jsonb not null default '{}'::jsonb,
    returned_quantities jsonb not null default '{}'::jsonb,
    handed_over_quantities jsonb not null default '{}'::jsonb,
    requested_quantities jsonb not null default '{}'::jsonb,
    status varchar(255) not null default 'draft',
    event_occurrence_id uuid,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    created_by uuid not null,
    id uuid not null,
    name varchar(160) not null,
    purpose varchar(4000) not null,
    primary key (id)
);

create table goods_receipt_lines (
    damaged_quantity integer not null,
    expected_quantity integer not null,
    received_quantity integer not null,
    rejected_quantity integer not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    goods_receipt_id uuid not null,
    id uuid not null,
    item_id uuid not null,
    lot_id uuid,
    purchase_order_line_id uuid not null,
    receiving_notes varchar(255),
    primary key (id)
);

create table goods_receipts (
    created_at timestamp(6) with time zone not null,
    received_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    idempotency_key uuid unique,
    purchase_order_id uuid not null,
    received_by uuid not null,
    receiving_location_id uuid not null,
    notes varchar(255),
    receipt_number varchar(255) not null unique,
    status varchar(255) not null check ((status in ('draft','posted','partially_accepted','rejected','reversed'))),
    primary key (id)
);

create table inventory_codes (
    active boolean not null,
    is_primary boolean not null,
    created_at timestamp(6) with time zone not null,
    retired_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    target_id uuid not null,
    code varchar(255) not null unique,
    target_type varchar(255) not null check ((target_type in ('product','asset','location','assembly','container','lot'))),
    primary key (id)
);

create table inventory_count_lines (
    expected_asset_version bigint,
    expected_asset_state varchar(255),
    approved_quantity integer,
    counted_quantity integer,
    expected_quantity integer not null,
    recounted_quantity integer,
    variance_quantity integer,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    asset_instance_id uuid,
    count_session_id uuid not null,
    counted_by uuid,
    id uuid not null,
    item_id uuid not null,
    location_id uuid not null,
    lot_id uuid,
    notes varchar(255),
    primary key (id)
);

create table inventory_count_sessions (
    blind_count boolean not null,
    approved_at timestamp(6) with time zone,
    completed_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone not null,
    started_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone not null,
    approved_by uuid,
    created_by uuid not null,
    id uuid not null,
    item_id uuid,
    location_id uuid,
    warehouse_id uuid,
    category varchar(255),
    notes varchar(255),
    session_number varchar(255) not null unique,
    status varchar(255) not null check ((status in ('draft','counting','awaiting_recount','awaiting_approval','approved','posted','cancelled'))),
    primary key (id)
);

create table inventory_lots (
    best_before_date date,
    expiry_date date,
    manufacture_date date,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    item_id uuid not null,
    lot_number varchar(255) not null,
    notes varchar(255),
    status varchar(255) not null check ((status in ('available','hold','recalled','expired','depleted'))),
    storage_requirements varchar(255),
    supplier_lot varchar(255),
    primary key (id),
    constraint uq_item_lot_number unique (item_id, lot_number)
);

create table inventory_positions (
    quantity_damaged integer not null,
    quantity_in_transit integer not null,
    quantity_on_hand integer not null,
    quantity_quarantined integer not null,
    quantity_reserved integer not null,
    created_at timestamp(6) with time zone not null,
    last_counted_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone not null,
    version bigint not null,
    id uuid not null,
    item_id uuid not null,
    location_id uuid not null,
    lot_id uuid,
    primary key (id),
    constraint uq_position_item_location_lot unique (item_id, location_id, lot_id)
);

create table inventory_transfer_lines (
    discrepancy_quantity integer not null,
    picked_quantity integer not null,
    received_quantity integer not null,
    requested_quantity integer not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    asset_instance_id uuid,
    id uuid not null,
    item_id uuid not null,
    lot_id uuid,
    transfer_id uuid not null,
    discrepancy_notes varchar(255),
    primary key (id)
);

create table inventory_transfers (
    created_at timestamp(6) with time zone not null,
    dispatched_at timestamp(6) with time zone,
    received_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone not null,
    destination_location_id uuid not null,
    id uuid not null,
    idempotency_key uuid unique,
    received_by uuid,
    requested_by uuid not null,
    source_location_id uuid not null,
    notes varchar(255),
    status varchar(255) not null check ((status in ('requested','picking','in_transit','partially_received','received','cancelled'))),
    transfer_number varchar(255) not null unique,
    primary key (id)
);

create table item_images (
    display_order integer not null,
    created_at timestamp(6) with time zone not null,
    id uuid not null,
    item_id uuid not null,
    object_key varchar(1000) not null,
    primary key (id)
);

create table items (
    equipment_revision bigint not null default 0,
    availability_policy varchar(255) not null default 'available',
    keeper_contact varchar(255),
    keeper_name varchar(255),
    owner_name varchar(255),
    ownership_type varchar(255) not null default 'organization',
    active boolean not null,
    base_amount integer not null,
    battery_replacement_due date,
    best_before_date date,
    container_count integer,
    container_remaining_pct integer,
    container_size numeric(38,2),
    containers_opened integer,
    current_operating_hours numeric(38,2) not null,
    fuel_consumption_l_100km numeric(38,2),
    is_consumable boolean not null,
    maintenance_interval_days integer,
    min_stock integer not null,
    next_maintenance_due date,
    unit_value_cents integer not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    assigned_user_id uuid,
    id uuid not null,
    return_location_id uuid,
    storage_location_id uuid,
    assigned_group varchar(255),
    category varchar(255) not null,
    description varchar(255),
    hint varchar(255),
    inventory_role varchar(255) not null check ((inventory_role in ('consumable','returnable','repairable','rental'))),
    maintenance_status varchar(255) not null check ((maintenance_status in ('certified','due_soon','overdue','in_service'))),
    name varchar(255) not null,
    position_details varchar(255),
    sku varchar(255) not null unique,
    subcategory varchar(255),
    supplier varchar(255),
    tracking_mode varchar(255) not null check ((tracking_mode in ('bulk','serialized','lot_tracked'))),
    visibility_scope varchar(255) not null check ((visibility_scope in ('global','event','person','group'))),
    event_tags jsonb not null,
    primary key (id),
    constraint equipment_owner_policy check (
    ownership_type = 'organization' or (owner_name is not null and availability_policy <> 'available'))
);

create table maintenance_records (
    operating_hours numeric(38,2),
    created_at timestamp(6) with time zone not null,
    next_due_at timestamp(6) with time zone,
    performed_at timestamp(6) with time zone not null,
    asset_instance_id uuid,
    id uuid not null,
    inspector_user_id uuid not null,
    item_id uuid not null,
    maintenance_schedule_id uuid,
    certificate_number varchar(255),
    certificate_object_key varchar(255),
    notes varchar(255),
    result varchar(255) not null check ((result in ('passed','failed','advisory'))),
    type varchar(255) not null check ((type in ('dguv_v3','generator_service','battery_test','chrono_fps'))),
    primary key (id)
);

create table maintenance_schedules (
    active boolean not null,
    checkout_blocking boolean not null,
    interval_value numeric(38,2) not null,
    next_due_value numeric(38,2),
    warning_window numeric(38,2) not null,
    created_at timestamp(6) with time zone not null,
    next_due_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone not null,
    asset_instance_id uuid,
    id uuid not null,
    item_id uuid not null,
    responsible_person_id uuid,
    required_checklist varchar(4000),
    interval_type varchar(255) not null check ((interval_type in ('date','operating_hours','usage_count'))),
    maintenance_type varchar(255) not null check ((maintenance_type in ('dguv_v3','generator_service','battery_test','chrono_fps'))),
    primary key (id)
);

create table notifications (
    delivery_attempts integer not null,
    created_at timestamp(6) with time zone not null,
    delivered_at timestamp(6) with time zone,
    read_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone not null,
    faction_order_id uuid,
    id uuid not null,
    recipient_id uuid not null,
    last_delivery_error varchar(2000),
    delivery_status varchar(255) not null,
    type varchar(255) not null,
    payload jsonb not null,
    primary key (id)
);

create table order_line_asset_assignments (
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    asset_instance_id uuid not null,
    faction_order_id uuid not null,
    id uuid not null,
    order_line_id uuid not null,
    primary key (id),
    constraint uq_order_assigned_asset unique (faction_order_id, asset_instance_id)
);

create table purchase_order_lines (
    ordered_quantity integer not null,
    received_quantity integer not null,
    unit_price_cents integer not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    item_id uuid not null,
    purchase_order_id uuid not null,
    notes varchar(255),
    primary key (id),
    constraint uq_purchase_order_item unique (purchase_order_id, item_id)
);

create table purchase_orders (
    expected_delivery_date date,
    order_date date not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    created_by uuid not null,
    event_occurrence_id uuid,
    id uuid not null,
    vendor_id uuid not null,
    notes varchar(255),
    order_number varchar(255) not null unique,
    status varchar(255) not null check ((status in ('draft','ordered','partially_received','received','cancelled','closed'))),
    primary key (id)
);

create table repair_cases (
    repaired_pending_quantity INTEGER NOT NULL DEFAULT 0,
    safety_impact boolean not null,
    completed_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone not null,
    started_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone not null,
    approved_by uuid,
    asset_instance_id uuid,
    damage_report_id uuid not null unique,
    handover_id uuid,
    id uuid not null,
    repair_owner_id uuid,
    repair_vendor_id uuid,
    notes varchar(255),
    parts_and_cost_notes varchar(255),
    status varchar(255) not null check ((status in ('reported','triaged','awaiting_repair','in_repair','repaired','verified','returned_to_service','written_off'))),
    verification_result varchar(255),
    primary key (id)
);

create table return_reconciliations (
    quantity integer not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    asset_instance_id uuid,
    faction_order_id uuid not null,
    id uuid not null,
    idempotency_key uuid,
    item_id uuid not null,
    order_line_id uuid not null,
    recorded_by uuid not null,
    condition_after varchar(255) check ((condition_after in ('new_condition','good','fair','damaged','unsafe','lost'))),
    condition_before varchar(255) check ((condition_before in ('new_condition','good','fair','damaged','unsafe','lost'))),
    notes varchar(255),
    outcome varchar(255) not null check ((outcome in ('returned_good','consumed','returned_damaged','missing','returned_late','written_off'))),
    primary key (id)
);

create table return_submissions (
    pending_asset_version bigint,
    event_occurrence_id UUID,
    general_order_id uuid,
    member_command_id uuid unique,
    quantity integer not null,
    acknowledged_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    acknowledged_by_id uuid,
    asset_instance_id uuid,
    expected_return_location_id uuid,
    faction_order_id uuid,
    id uuid not null,
    item_id uuid not null,
    returned_for_user_id uuid not null,
    submitted_by_id uuid not null,
    acknowledgement_notes varchar(255),
    notes varchar(255),
    placement_image_object_key varchar(255),
    previous_asset_state varchar(255) check ((previous_asset_state in ('available','reserved','staged','in_transit','in_custody','in_field','returned_pending_check','damaged','in_repair','in_maintenance','lost','written_off'))),
    status varchar(255) not null check ((status in ('pending','accepted','rejected'))),
    primary key (id)
);

create table stock_reservations (
    released_quantity integer not null,
    requested_quantity integer not null,
    reserved_quantity integer not null,
    created_at timestamp(6) with time zone not null,
    released_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone not null,
    version bigint not null,
    asset_instance_id uuid,
    created_by uuid not null,
    faction_order_id uuid not null,
    id uuid not null,
    item_id uuid not null,
    location_id uuid,
    order_line_id uuid not null,
    active_asset_key varchar(255),
    status varchar(255) not null check ((status in ('active','partially_released','converted_to_custody','released','closed'))),
    primary key (id),
    constraint uq_active_asset_reservation unique (asset_instance_id, active_asset_key)
);

create table stock_transactions (
    position_quantities JSONB NOT NULL DEFAULT '{}',
    lot_id UUID,
    custody_write_off boolean not null default false,
    event_occurrence_id uuid,
    availability_after integer,
    availability_before integer,
    quantity integer not null,
    created_at timestamp(6) with time zone not null,
    occurred_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    asset_instance_id uuid,
    client_command_id uuid,
    damage_report_id uuid,
    destination_location_id uuid,
    faction_order_id uuid,
    id uuid not null,
    idempotency_key uuid unique,
    item_id uuid not null,
    related_entity_id uuid,
    source_location_id uuid,
    user_id uuid not null,
    event_type varchar(255),
    faction varchar(255),
    notes varchar(255),
    reason varchar(255),
    related_entity_type varchar(255),
    type varchar(255) not null check ((type in ('received','adjusted','reserved','reservation_released','transfer_out','transfer_in','staged','checkout','checkin','added','consumed','damaged','missing','repaired','written_off'))),
    primary key (id)
);

create table storage_locations (
    parent_location_id uuid,
    keeper_user_id uuid,
    active boolean not null,
    latitude float(53),
    longitude float(53),
    map_zoom integer not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    warehouse_id uuid,
    map_overlay_url varchar(1000),
    area varchar(255),
    description varchar(255),
    location varchar(255),
    location_type varchar(255) not null check ((location_type in ('warehouse','bin','staging','event_site','vehicle','in_custody','quarantine','repair','scrap'))),
    name varchar(255) not null,
    position varchar(255),
    overlay_bounds jsonb,
    primary key (id),
    constraint storage_location_not_own_parent check (parent_location_id <> id)
);

create table sync_command_audit (
    resolution_note varchar(2000),
    resolution_root uuid,
    supersedes uuid,
    retry_count integer not null,
    created_at timestamp(6) with time zone not null,
    local_timestamp timestamp(6) with time zone,
    updated_at timestamp(6) with time zone not null,
    command_id uuid not null unique,
    id uuid not null,
    user_id uuid not null,
    conflict_message varchar(2000),
    device_id varchar(255),
    operation_type varchar(255) not null,
    sync_status varchar(255) not null,
    payload jsonb not null,
    server_result jsonb,
    primary key (id)
);

create table vendor_documents (
    currency varchar(3),
    document_date date,
    retention_until date,
    created_at timestamp(6) with time zone not null,
    file_size bigint not null,
    total_amount_cents bigint,
    updated_at timestamp(6) with time zone not null,
    uploaded_at timestamp(6) with time zone not null,
    goods_receipt_id uuid,
    id uuid not null,
    purchase_order_id uuid,
    uploaded_by uuid not null,
    vendor_id uuid not null,
    checksum varchar(128) not null,
    document_type varchar(255) not null check ((document_type in ('invoice','delivery_note','quote','warranty','certificate','other'))),
    mime_type varchar(255) not null,
    notes varchar(255),
    object_storage_key varchar(255) not null unique,
    original_filename varchar(255) not null,
    reference_number varchar(255),
    primary key (id)
);

create table vendors (
    active boolean not null,
    preferred_vendor boolean not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    address varchar(255),
    contact_person varchar(255),
    email varchar(255),
    internal_notes varchar(255),
    name varchar(255) not null unique,
    payment_notes varchar(255),
    phone varchar(255),
    website varchar(255),
    primary key (id)
);

create table warehouses (
    active boolean not null,
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null,
    id uuid not null,
    code varchar(255) not null unique,
    description varchar(255),
    name varchar(255) not null,
    primary key (id)
);

create table member_requests (
    id uuid primary key,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    requester_id uuid not null,
    item_id uuid not null,
    asset_id uuid,
    location_id uuid,
    kind varchar(255) not null,
    quantity integer not null check (quantity > 0),
    notes varchar(2000) not null,
    status varchar(255) not null,
    response varchar(2000),
    handled_by_id uuid,
    handled_at timestamptz,
    command_id uuid not null unique,
    revision bigint not null default 0
);

create table action_reminders (
    id uuid primary key,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    user_id uuid not null,
    action_key varchar(255) not null,
    remind_at timestamptz,
    unique(user_id, action_key)
);

create table category_maintenance_policies (
    id uuid not null primary key,
    category varchar(255) not null unique,
    interval_days integer not null check (interval_days > 0),
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null
);

create table general_order_history (
    id uuid primary key,
    order_id uuid not null,
    actor_id uuid not null,
    occurred_at timestamp with time zone not null,
    action varchar(255) not null,
    notes varchar(4000),
    delta jsonb not null,
    command_id uuid unique
);

create table planning_overrides (
    id uuid primary key,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    event_id uuid not null,
    item_id uuid not null,
    actor_id uuid not null,
    quantity integer not null,
    reason varchar(2000) not null
);

create table operational_reports (
    name varchar(255) primary key,
    version bigint not null default 0,
    started_at timestamptz,
    generated_at timestamptz,
    source_token varchar(8000),
    report_rows jsonb not null default '[]'
);

create table equipment_commitments (
    id uuid primary key,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    item_id uuid not null,
    event_id uuid,
    quantity integer not null check (quantity > 0),
    asset_ids jsonb not null default '[]',
    available_from date not null,
    available_until date not null,
    pickup_details varchar(255) not null,
    return_due date,
    return_details varchar(255),
    notes varchar(255) not null,
    cancelled boolean not null default false,
    cancellation_reason varchar(255),
    recorded_by uuid not null,
    check (available_until >= available_from),
    check (return_due is null or return_due >= available_until)
);

create table loan_arrangements (
    id uuid primary key,
    created_at timestamptz not null,
    updated_at timestamptz not null,
    commitment_id uuid not null unique,
    provider_location_id uuid not null,
    kind varchar(255) not null,
    provider varchar(255) not null,
    contact varchar(255) not null,
    terms varchar(2000) not null,
    collected integer not null default 0,
    returned integer not null default 0,
    collected_assets jsonb not null default '[]',
    returned_assets jsonb not null default '[]',
    transfer_ids jsonb not null default '[]',
    history jsonb not null default '[]',
    revision bigint not null default 0,
    check (returned >= 0 and collected >= returned)
);

-- Indexes and relationships are declared after all tables.
create index ix_outbox_delivery on domain_event_outbox (status, available_at, occurred_at);
create index ix_outbox_aggregate on domain_event_outbox (aggregate_type, aggregate_id, occurred_at);
create index ix_reservation_item_status on stock_reservations (item_id, status);
create index ix_reservation_order on stock_reservations (faction_order_id);
create index ix_return_submission_status on return_submissions (status, created_at);
create index ix_return_submission_user on return_submissions (returned_for_user_id, status);

-- Stock snapshots, usage counters, paged history and batched child projections.
create index ix_tx_item_type on stock_transactions (item_id, type);
create index ix_tx_asset_type on stock_transactions (asset_instance_id, type) where asset_instance_id is not null;
create index ix_tx_occurred_page on stock_transactions (occurred_at desc, id desc);
create index ix_damage_item_status on damage_reports (item_id, status);
create index ix_asset_item_active on asset_instances (item_id, active);
create index ix_schedule_item_active on maintenance_schedules (item_id, active);
create index ix_images_item_order on item_images (item_id, display_order);
create index ix_order_lines_order on faction_order_lines (faction_order_id);
create index ix_purchase_lines_item on purchase_order_lines (item_id, purchase_order_id);
alter table if exists assembly_items add constraint FK4gy48ars675efhc1kyjqkvu7n foreign key (assembly_id) references assemblies;
alter table if exists assembly_items add constraint FKq6cfebw2dybsanpmpubg7yx7l foreign key (item_id) references items;
alter table if exists asset_instances add constraint FKrlema8bn57buxawxdeffoo0hb foreign key (current_custodian_id) references app_users;
alter table if exists asset_instances add constraint FK7ghvlivwcuomiav1i68y0yvna foreign key (current_location_id) references storage_locations;
alter table if exists asset_instances add constraint FK2nah7lrvrpnk0sd94n5f5yhei foreign key (item_id) references items;
alter table if exists custody_handover_lines add constraint FKkd2r5jq8f842lm1wot127krxl foreign key (asset_instance_id) references asset_instances;
alter table if exists custody_handover_lines add constraint FKnscbnc7m7jfn7pmpux47k36ko foreign key (handover_id) references custody_handovers;
alter table if exists custody_handover_lines add constraint FKheq2apa32ewu6vnn2fx0xwsse foreign key (item_id) references items;
alter table if exists custody_handover_lines add constraint FK9g4v2wd24ok7mh46hu7ug223k foreign key (order_line_id) references faction_order_lines;
alter table if exists custody_handovers add constraint FK8km9lc7xjhu8vhpvjokqihnhe foreign key (collector_id) references app_users;
alter table if exists custody_handovers add constraint FKi3ddcy3dux9ufwqxp4o4kw3em foreign key (location_id) references storage_locations;
alter table if exists custody_handovers add constraint FKh3vkeb291dve286tjkwpnp7tu foreign key (marshal_id) references app_users;
alter table if exists custody_handovers add constraint FKpqpgh84ysxt38q2i0gdhghbj foreign key (faction_order_id) references faction_orders;
alter table if exists damage_reports add constraint FKfceag5iuo1m7w2swi9sah11p1 foreign key (asset_instance_id) references asset_instances;
alter table if exists damage_reports add constraint FKn9apqooou5hcrwcjbr5n0i3bw foreign key (faction_order_id) references faction_orders;
alter table if exists damage_reports add constraint FK7kvceevoqpeui1ngkr1gaw8nf foreign key (handler_id) references app_users;
alter table if exists damage_reports add constraint FKmpihxciswrtjdwkpv4agxpvgj foreign key (handover_id) references custody_handovers;
alter table if exists damage_reports add constraint FK1726nlgux21ux0f1tkm8p74j3 foreign key (item_id) references items;
alter table if exists damage_reports add constraint FKhcc49n1385ffjwru87udmpyf6 foreign key (reporter_id) references app_users;
alter table if exists faction_order_history add constraint FK44yhw1vjv9nswmvrakof1vwgx foreign key (actor_id) references app_users;
alter table if exists faction_order_history add constraint FKk3q91utkmicbonyp0shfv8g2x foreign key (faction_order_id) references faction_orders;
alter table if exists faction_order_lines add constraint FK9w60olcs2v274ribt4v109anc foreign key (item_id) references items;
alter table if exists faction_order_lines add constraint FKew2kmchd1efiy3480xdh0w3j6 foreign key (faction_order_id) references faction_orders;
alter table if exists faction_order_lines add constraint FKiuad51ke9gh1ts3fnrogjttx foreign key (source_assembly_id) references assemblies;
alter table if exists faction_orders add constraint FKr24yfrysb677m97gh83rqus58 foreign key (created_by) references app_users;
alter table if exists faction_orders add constraint FK5eymr1fj5mr2ej9t8u0bddf3g foreign key (event_occurrence_id) references event_occurrences;
alter table if exists faction_orders add constraint FKnd0tvadtfm4tkm6rpjpbhaaqi foreign key (faction_id) references factions;
alter table if exists faction_orders add constraint FKs8gvwvfne4njvvwcliegqb0p3 foreign key (picked_up_by) references app_users;
alter table if exists faction_orders add constraint FKn2vr9hmo0tn85quxbefqmx4mn foreign key (pickup_location_id) references storage_locations;
alter table if exists faction_orders add constraint FKeaoh5w8ylgvkmkjy0tkksaipe foreign key (prepared_by) references app_users;
alter table if exists faction_orders add constraint FKhro0l991w7cdulcqb9mf8koaq foreign key (ready_by) references app_users;
alter table if exists faction_orders add constraint FKkbn5273g707e8yf109ojf87s2 foreign key (returned_by) references app_users;
alter table if exists general_orders add constraint FKnds7vh9hn1pdumptqskl1vtje foreign key (created_by) references app_users;
alter table if exists goods_receipt_lines add constraint FK911tv4c70yqo1u58rdfa0pf5w foreign key (goods_receipt_id) references goods_receipts;
alter table if exists goods_receipt_lines add constraint FKkyb5k22b0wc8r6o8uw81nkugt foreign key (item_id) references items;
alter table if exists goods_receipt_lines add constraint FK39tw1j6m41ac7g3lou50xp30w foreign key (lot_id) references inventory_lots;
alter table if exists goods_receipt_lines add constraint FK4ugxcd2dc6mmqesx8kf2c3eu4 foreign key (purchase_order_line_id) references purchase_order_lines;
alter table if exists goods_receipts add constraint FK31kyyaqb354qfc4pssihmmry5 foreign key (purchase_order_id) references purchase_orders;
alter table if exists goods_receipts add constraint FK849cwywob3l2tupw9cnu7r8ga foreign key (received_by) references app_users;
alter table if exists goods_receipts add constraint FKre8866brsd8qm5ohoma7jnlvx foreign key (receiving_location_id) references storage_locations;
alter table if exists inventory_count_lines add constraint FKps7uwiauss8l57s3wrue40liy foreign key (asset_instance_id) references asset_instances;
alter table if exists inventory_count_lines add constraint FKq3vr36dh6twtvyifqpm643xhh foreign key (counted_by) references app_users;
alter table if exists inventory_count_lines add constraint FKg0ynx17o9jg1wv4wwh50ka88e foreign key (item_id) references items;
alter table if exists inventory_count_lines add constraint FKhwrk5v2ffem3mfp2g9rk1npjg foreign key (location_id) references storage_locations;
alter table if exists inventory_count_lines add constraint FKangp2c31tm2djxkqwo68vpju8 foreign key (lot_id) references inventory_lots;
alter table if exists inventory_count_lines add constraint FKep49tbtx3vctk9d95atoj6fvo foreign key (count_session_id) references inventory_count_sessions;
alter table if exists inventory_count_sessions add constraint FKnwlssfgd3c4qy2ts6812115uv foreign key (approved_by) references app_users;
alter table if exists inventory_count_sessions add constraint FKjtgetwus8ico71elk512fjkjq foreign key (created_by) references app_users;
alter table if exists inventory_count_sessions add constraint FKsrmxe4wlb4v7djhkynsgp0hr5 foreign key (item_id) references items;
alter table if exists inventory_count_sessions add constraint FKi4iu22vc1rjsm9im3rmvd0g4n foreign key (location_id) references storage_locations;
alter table if exists inventory_count_sessions add constraint FKacnvwdevsytaj3281q0s5q6w3 foreign key (warehouse_id) references warehouses;
alter table if exists inventory_lots add constraint FK4h0x1nou1xh6hmxr3021qlg4h foreign key (item_id) references items;
alter table if exists inventory_positions add constraint FKfyqp6h4cmoxv0g7qgk9v4ljjr foreign key (item_id) references items;
alter table if exists inventory_positions add constraint FKpme5x3av41i391twhp89f1tqe foreign key (location_id) references storage_locations;
alter table if exists inventory_positions add constraint FK9r7yj4056os2wwgug82jn97u9 foreign key (lot_id) references inventory_lots;
alter table if exists inventory_transfer_lines add constraint FKxwdnm94flcfw3r7iukw6unie foreign key (asset_instance_id) references asset_instances;
alter table if exists inventory_transfer_lines add constraint FKkx5o8ralvpydn43n06x78y6wh foreign key (item_id) references items;
alter table if exists inventory_transfer_lines add constraint FKqtmu0c8sapq21n2n1bgvc5qt1 foreign key (lot_id) references inventory_lots;
alter table if exists inventory_transfer_lines add constraint FK10tml7en4mig2i87hlvapxift foreign key (transfer_id) references inventory_transfers;
alter table if exists inventory_transfers add constraint FKqatdnmn6jcp5lqprn6dagpv5p foreign key (destination_location_id) references storage_locations;
alter table if exists inventory_transfers add constraint FKa27ocp24r656l2oskq3o1rb3j foreign key (received_by) references app_users;
alter table if exists inventory_transfers add constraint FK8inh7jqflxtcmeiqfjfh8vsm7 foreign key (requested_by) references app_users;
alter table if exists inventory_transfers add constraint FK63vf9w6brlkkuqsmqhbftopk2 foreign key (source_location_id) references storage_locations;
alter table if exists item_images add constraint FK31vykiuqi6nfw2rmvw37qlydy foreign key (item_id) references items;
alter table if exists items add constraint FK862l4eg9xtjse2qhfvkvfwmah foreign key (storage_location_id) references storage_locations;
alter table if exists items add constraint fk_items_assigned_user foreign key (assigned_user_id) references app_users;
alter table if exists items add constraint fk_items_return_location foreign key (return_location_id) references storage_locations;
alter table if exists maintenance_records add constraint FKe918boimdlhepwro1scll3nmo foreign key (asset_instance_id) references asset_instances;
alter table if exists maintenance_records add constraint FKripmhtkxfmlhnf0ltbw7mt6y7 foreign key (inspector_user_id) references app_users;
alter table if exists maintenance_records add constraint FK85imw9qjkb6j3fsiessub3qd9 foreign key (item_id) references items;
alter table if exists maintenance_records add constraint FKa9b4v1xbl41ojn1nv0alxy230 foreign key (maintenance_schedule_id) references maintenance_schedules;
alter table if exists maintenance_schedules add constraint FKa5k6d8pwvk2owwrywruax68gm foreign key (asset_instance_id) references asset_instances;
alter table if exists maintenance_schedules add constraint FKfowb478r1hybovjlbckinkbq0 foreign key (item_id) references items;
alter table if exists maintenance_schedules add constraint FK4ctnmnplwnq1t6jcx7i8coewt foreign key (responsible_person_id) references app_users;
alter table if exists notifications add constraint FKdjkdrxn3guyelfwepstlh9ujf foreign key (faction_order_id) references faction_orders;
alter table if exists notifications add constraint FK7mpd9n24ptruj9hf4lw0otrf6 foreign key (recipient_id) references app_users;
alter table if exists order_line_asset_assignments add constraint FKlulb9vi531os91f8ii4ekb1mw foreign key (asset_instance_id) references asset_instances;
alter table if exists order_line_asset_assignments add constraint FK3u63m4j57j3r5380usk4mg14f foreign key (faction_order_id) references faction_orders;
alter table if exists order_line_asset_assignments add constraint FKnaixvgl99bm7bfldppc640r82 foreign key (order_line_id) references faction_order_lines;
alter table if exists purchase_order_lines add constraint FK4ujkyf39v3kx3dg83lpp4qnnk foreign key (item_id) references items;
alter table if exists purchase_order_lines add constraint FKlm5ieywqw1p1l4oxnkup8j2m6 foreign key (purchase_order_id) references purchase_orders;
alter table if exists purchase_orders add constraint FK3yq8odwf991ove3xaoefkruyk foreign key (created_by) references app_users;
alter table if exists purchase_orders add constraint FK6qjdk86m9qkylka4mg53roh60 foreign key (event_occurrence_id) references event_occurrences;
alter table if exists purchase_orders add constraint FKn3rssy7613r6x49ax30e2nbay foreign key (vendor_id) references vendors;
alter table if exists repair_cases add constraint FK3plsr1lfnrdylryd25jq75xj2 foreign key (approved_by) references app_users;
alter table if exists repair_cases add constraint FKm82waxgbeeafkh71g0p6y9h07 foreign key (asset_instance_id) references asset_instances;
alter table if exists repair_cases add constraint FKmdapddtsuea22cxu1uoje42s0 foreign key (damage_report_id) references damage_reports;
alter table if exists repair_cases add constraint FKnalcdpfru3tnd9hw4ij3touap foreign key (handover_id) references custody_handovers;
alter table if exists repair_cases add constraint FKc1gc6d7jnlgswrfpvnisx345p foreign key (repair_owner_id) references app_users;
alter table if exists repair_cases add constraint FK3edpw9vidm036u7iwu8val9ls foreign key (repair_vendor_id) references vendors;
alter table if exists return_reconciliations add constraint FKo6jccomogq4j1pggd3xixf8yq foreign key (asset_instance_id) references asset_instances;
alter table if exists return_reconciliations add constraint FKjmnrkcgyugdaibmu92ylkauit foreign key (item_id) references items;
alter table if exists return_reconciliations add constraint FKociomjtc1rwln9agvrhfrwfwx foreign key (faction_order_id) references faction_orders;
alter table if exists return_reconciliations add constraint FKra0obl52m5cs2673m1h3wlifh foreign key (order_line_id) references faction_order_lines;
alter table if exists return_reconciliations add constraint FKpk6x8vay2fprgpam38fd1364e foreign key (recorded_by) references app_users;
alter table if exists return_submissions add constraint fk_return_submissions_acknowledged_by foreign key (acknowledged_by_id) references app_users;
alter table if exists return_submissions add constraint fk_return_submissions_asset foreign key (asset_instance_id) references asset_instances;
alter table if exists return_submissions add constraint fk_return_submissions_expected_location foreign key (expected_return_location_id) references storage_locations;
alter table if exists return_submissions add constraint fk_return_submissions_order foreign key (faction_order_id) references faction_orders;
alter table if exists return_submissions add constraint fk_return_submissions_item foreign key (item_id) references items;
alter table if exists return_submissions add constraint fk_return_submissions_returned_for foreign key (returned_for_user_id) references app_users;
alter table if exists return_submissions add constraint fk_return_submissions_submitted_by foreign key (submitted_by_id) references app_users;
alter table if exists stock_reservations add constraint FKd8xa6txnw5i6tvotpkgktsqq6 foreign key (asset_instance_id) references asset_instances;
alter table if exists stock_reservations add constraint FKp93w882bwlhxrg5xema8qvrpv foreign key (created_by) references app_users;
alter table if exists stock_reservations add constraint FK197w8jtwynn96u4y024k7fpby foreign key (item_id) references items;
alter table if exists stock_reservations add constraint FKadmgnd316fdte197amsw2xx3i foreign key (location_id) references storage_locations;
alter table if exists stock_reservations add constraint FK1a7hux5wufjtwsc14qj5uteuc foreign key (faction_order_id) references faction_orders;
alter table if exists stock_reservations add constraint FKapq17godoxbfyitel0wsbbikk foreign key (order_line_id) references faction_order_lines;
alter table if exists stock_transactions add constraint FKg4i4s6t7270puviqpdi3uqa2h foreign key (asset_instance_id) references asset_instances;
alter table if exists stock_transactions add constraint FKhb608yt9ysaw9s0b2fcedis1c foreign key (damage_report_id) references damage_reports;
alter table if exists stock_transactions add constraint FK8onwouvrscju1hqxh73p0caxt foreign key (destination_location_id) references storage_locations;
alter table if exists stock_transactions add constraint FKsdp6k6b14fehh151m2s8fi4pi foreign key (faction_order_id) references faction_orders;
alter table if exists stock_transactions add constraint FK7fugsbc704m7063vy0q3851ma foreign key (item_id) references items;
alter table if exists stock_transactions add constraint FKlcvjkirperrl89dw99j5twham foreign key (source_location_id) references storage_locations;
alter table if exists stock_transactions add constraint FKajynergjacpmi9gft58h26uk foreign key (user_id) references app_users;
alter table if exists storage_locations add constraint FK94deej4le4g06iglvdj1oxobn foreign key (warehouse_id) references warehouses;
alter table if exists sync_command_audit add constraint FK204w71qvomhrci4bv3p212gbx foreign key (user_id) references app_users;
alter table if exists vendor_documents add constraint FKeuhya1ea21gyq5odbrci7n1bi foreign key (goods_receipt_id) references goods_receipts;
alter table if exists vendor_documents add constraint FKsyyhv6b9ypn90u5s3sm6iyomf foreign key (purchase_order_id) references purchase_orders;
alter table if exists vendor_documents add constraint FK9j7d2x57qgg7s6saes8n93fps foreign key (uploaded_by) references app_users;
alter table if exists vendor_documents add constraint FKhjvyn99g3h3tuvfyh96d3erxx foreign key (vendor_id) references vendors;
create index member_requests_item_state on member_requests(item_id, kind, status);
alter table damage_reports add constraint fk_damage_reports_assembly foreign key (assembly_id) references assemblies;
create index ix_transaction_event_occurrence on stock_transactions(event_occurrence_id);
create index ix_general_order_history_order on general_order_history(order_id);
create index idx_location_parent on storage_locations(parent_location_id);
create index idx_sync_resolution_root on sync_command_audit(resolution_root);
create index equipment_commitments_item_dates on equipment_commitments(item_id, available_from, available_until);
create index ix_overrides_latest on planning_overrides (event_id, item_id, created_at desc, id desc);
-- Foreign keys used by location/stock reads (PostgreSQL does not index referencing columns itself).
create index ix_positions_location on inventory_positions (location_id);
create index ix_tx_source_location on stock_transactions (source_location_id) where source_location_id is not null;
create index ix_tx_destination_location on stock_transactions (destination_location_id) where destination_location_id is not null;
create index ix_asset_current_location on asset_instances (current_location_id) where current_location_id is not null;
create index ix_reservation_location on stock_reservations (location_id) where location_id is not null;
create index ix_handover_lines_item on custody_handover_lines (item_id);
-- Case-insensitive exact code lookups (non-unique: uniqueness stays on the stored values).
create index ix_asset_code_lower on asset_instances (lower(asset_code));
create index ix_inventory_code_lower on inventory_codes (lower(code));
create index ix_items_name_trgm on items using gin (lower(name) gin_trgm_ops);
create index ix_items_sku_trgm on items using gin (lower(sku) gin_trgm_ops);
create index ix_items_category_trgm on items using gin (lower(category) gin_trgm_ops);
alter table general_orders add constraint general_orders_event_occurrence_id_fkey foreign key (event_occurrence_id) references event_occurrences(id);
alter table return_submissions add constraint return_submissions_event_occurrence_id_fkey foreign key (event_occurrence_id) references event_occurrences(id);
alter table return_submissions add constraint return_submissions_general_order_id_fkey foreign key (general_order_id) references general_orders(id);
alter table stock_transactions add constraint stock_transactions_lot_id_fkey foreign key (lot_id) references inventory_lots(id);
alter table stock_transactions add constraint stock_transactions_event_occurrence_id_fkey foreign key (event_occurrence_id) references event_occurrences(id);
alter table storage_locations add constraint storage_locations_parent_location_id_fkey foreign key (parent_location_id) references storage_locations(id);
alter table storage_locations add constraint storage_locations_keeper_user_id_fkey foreign key (keeper_user_id) references app_users(id);
alter table sync_command_audit add constraint sync_command_audit_resolution_root_fkey foreign key (resolution_root) references sync_command_audit(command_id);
alter table sync_command_audit add constraint sync_command_audit_supersedes_fkey foreign key (supersedes) references sync_command_audit(command_id);
alter table member_requests add constraint member_requests_requester_id_fkey foreign key (requester_id) references app_users(id);
alter table member_requests add constraint member_requests_item_id_fkey foreign key (item_id) references items(id);
alter table member_requests add constraint member_requests_asset_id_fkey foreign key (asset_id) references asset_instances(id);
alter table member_requests add constraint member_requests_location_id_fkey foreign key (location_id) references storage_locations(id);
alter table member_requests add constraint member_requests_handled_by_id_fkey foreign key (handled_by_id) references app_users(id);
alter table action_reminders add constraint action_reminders_user_id_fkey foreign key (user_id) references app_users(id);
alter table general_order_history add constraint general_order_history_order_id_fkey foreign key (order_id) references general_orders(id);
alter table general_order_history add constraint general_order_history_actor_id_fkey foreign key (actor_id) references app_users(id);
alter table planning_overrides add constraint planning_overrides_event_id_fkey foreign key (event_id) references event_occurrences(id);
alter table planning_overrides add constraint planning_overrides_item_id_fkey foreign key (item_id) references items(id);
alter table planning_overrides add constraint planning_overrides_actor_id_fkey foreign key (actor_id) references app_users(id);
alter table equipment_commitments add constraint equipment_commitments_item_id_fkey foreign key (item_id) references items(id);
alter table equipment_commitments add constraint equipment_commitments_event_id_fkey foreign key (event_id) references event_occurrences(id);
alter table equipment_commitments add constraint equipment_commitments_recorded_by_fkey foreign key (recorded_by) references app_users(id);
alter table loan_arrangements add constraint loan_arrangements_commitment_id_fkey foreign key (commitment_id) references equipment_commitments(id);
alter table loan_arrangements add constraint loan_arrangements_provider_location_id_fkey foreign key (provider_location_id) references storage_locations(id);

-- Private resource policies and stable, administrator-managed share groups.
create table inventory_access_policies (
    id uuid primary key, created_at timestamp(6) with time zone not null, updated_at timestamp(6) with time zone not null,
    owner_user_id uuid not null references app_users(id), revision bigint not null
);
create table inventory_access_groups (
    id uuid primary key, created_at timestamp(6) with time zone not null, updated_at timestamp(6) with time zone not null,
    name varchar(255) not null unique, revision bigint not null
);
create unique index inventory_access_group_name on inventory_access_groups(lower(name));
create table inventory_access_group_members (
    group_id uuid not null references inventory_access_groups(id), user_id uuid not null references app_users(id),
    primary key (group_id, user_id)
);
create index inventory_access_members_user on inventory_access_group_members(user_id, group_id);
create table inventory_access_grants (
    id uuid primary key, created_at timestamp(6) with time zone not null, updated_at timestamp(6) with time zone not null,
    policy_id uuid not null references inventory_access_policies(id), user_id uuid references app_users(id),
    group_id uuid references inventory_access_groups(id), can_edit boolean not null,
    check ((user_id is null) <> (group_id is null)), unique (policy_id, user_id), unique (policy_id, group_id)
);
create index inventory_access_grants_user on inventory_access_grants(user_id, policy_id);
create index inventory_access_grants_group on inventory_access_grants(group_id, policy_id);
alter table items add column access_policy_id uuid unique references inventory_access_policies(id);
alter table storage_locations add column access_policy_id uuid unique references inventory_access_policies(id);
alter table assemblies add column access_policy_id uuid unique references inventory_access_policies(id);
create table inventory_media_objects (
    id uuid primary key, created_at timestamp(6) with time zone not null, updated_at timestamp(6) with time zone not null,
    object_key varchar(1024) not null unique, uploader_id uuid not null references app_users(id),
    resource_type varchar(255), resource_id uuid,
    check ((resource_type is null) = (resource_id is null))
);
-- Upload quota and abandoned-upload purge read only staged (unattached) objects.
create index ix_media_staged on inventory_media_objects (uploader_id, created_at) where resource_type is null;
create index ix_media_staged_age on inventory_media_objects (created_at) where resource_type is null;

-- Commit-ordered revisions: counter updates commit or roll back with the source writes.
-- Each table has 16 counter shards; a writer increments the shard of its backend connection,
-- so concurrent writers to one table do not serialize on a single hot row. Readers sum the shards.
CREATE TABLE source_revisions (
    name varchar(100) NOT NULL,
    shard smallint NOT NULL,
    revision bigint NOT NULL DEFAULT 0,
    epoch uuid NOT NULL DEFAULT gen_random_uuid(),
    PRIMARY KEY (name, shard)
);
CREATE OR REPLACE FUNCTION advance_source_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE touched bigint;
BEGIN
    EXECUTE format('UPDATE %I.source_revisions SET revision = revision + 1 WHERE name = $1 AND shard = pg_backend_pid() %% 16', TG_TABLE_SCHEMA) USING TG_TABLE_NAME;
    GET DIAGNOSTICS touched = ROW_COUNT;
    IF touched = 0 THEN RAISE EXCEPTION 'Missing source revision for %', TG_TABLE_NAME; END IF;
    RETURN NULL;
END;
$$;
INSERT INTO source_revisions (name, shard) SELECT 'items', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON items FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'storage_locations', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON storage_locations FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'warehouses', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON warehouses FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'event_occurrences', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON event_occurrences FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'faction_orders', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON faction_orders FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'faction_order_lines', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON faction_order_lines FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'general_orders', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON general_orders FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'app_users', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON app_users FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'vendors', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON vendors FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'stock_reservations', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON stock_reservations FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'inventory_positions', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON inventory_positions FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'inventory_lots', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON inventory_lots FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'asset_instances', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON asset_instances FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'return_submissions', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON return_submissions FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'damage_reports', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON damage_reports FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'repair_cases', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON repair_cases FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'maintenance_schedules', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON maintenance_schedules FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'maintenance_records', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON maintenance_records FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'purchase_orders', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON purchase_orders FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'purchase_order_lines', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON purchase_order_lines FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'inventory_count_sessions', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON inventory_count_sessions FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'inventory_count_lines', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON inventory_count_lines FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'stock_transactions', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON stock_transactions FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'equipment_commitments', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON equipment_commitments FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'loan_arrangements', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON loan_arrangements FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'member_requests', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON member_requests FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();
INSERT INTO source_revisions (name, shard) SELECT 'factions', shard FROM generate_series(0, 15) AS shard;
CREATE TRIGGER source_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON factions FOR EACH STATEMENT EXECUTE FUNCTION advance_source_revision();

-- Reference data: event types and their factions. Planners add more through /api/factions.
INSERT INTO factions (id, created_at, updated_at, is_active, event_type, name, slug)
SELECT gen_random_uuid(), now(), now(), true, event_type, name, slug FROM (VALUES
    ('DE', 'KGG', 'kgg'),
    ('DE', 'GOF', 'gof'),
    ('DE', 'Enklave', 'enklave'),
    ('DE', 'Miliz', 'miliz'),
    ('LS', 'UCRF', 'ucrf'),
    ('LS', 'TERA', 'tera'),
    ('TNO', 'Militär', 'militar'),
    ('TNO', 'Freiheit', 'freiheit'),
    ('TNO', 'Stalker', 'stalker'),
    ('TNO', 'Banditen', 'banditen'),
    ('TNO', 'Wissenschaftler', 'wissenschaftler'),
    ('ASD', 'Delta', 'delta'),
    ('ASD', 'Ghost', 'ghost'),
    ('M24', 'Hondra', 'hondra'),
    ('M24', 'Militär', 'militar'),
    ('M24', 'Kartell', 'kartell')
) AS seed(event_type, name, slug);
