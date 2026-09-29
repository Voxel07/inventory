-- Legacy inventory is explicitly organization-owned; visibility and storage are not ownership evidence.
alter table items add column ownership_type varchar(255) not null default 'organization';
alter table items add column owner_name varchar(255);
alter table items add column keeper_name varchar(255);
alter table items add column keeper_contact varchar(255);
alter table items add column availability_policy varchar(255) not null default 'available';
alter table items add column equipment_revision bigint not null default 0;
alter table items add constraint equipment_owner_policy check (
    ownership_type = 'organization' or (owner_name is not null and availability_policy <> 'available'));
create table equipment_commitments (
    id uuid primary key,
    created_at timestamptz not null, updated_at timestamptz not null,
    item_id uuid not null references items(id), event_id uuid references event_occurrences(id),
    quantity integer not null check (quantity > 0), asset_ids jsonb not null default '[]',
    available_from date not null, available_until date not null,
    pickup_details varchar(255) not null, return_due date, return_details varchar(255),
    notes varchar(255) not null, cancelled boolean not null default false,
    cancellation_reason varchar(255), recorded_by uuid not null references app_users(id),
    check (available_until >= available_from),
    check (return_due is null or return_due >= available_until)
);
create index equipment_commitments_item_dates on equipment_commitments(item_id, available_from, available_until);

-- Arrangement definition alongside the commitment schema; no incremental migration.
create table loan_arrangements (
    id uuid primary key, created_at timestamptz not null, updated_at timestamptz not null,
    commitment_id uuid not null unique references equipment_commitments(id),
    provider_location_id uuid not null references storage_locations(id), kind varchar(255) not null,
    provider varchar(255) not null, contact varchar(255) not null, terms varchar(2000) not null,
    collected integer not null default 0, returned integer not null default 0,
    collected_assets jsonb not null default '[]', returned_assets jsonb not null default '[]',
    transfer_ids jsonb not null default '[]', history jsonb not null default '[]', revision bigint not null default 0,
    check (returned >= 0 and collected >= returned)
);
