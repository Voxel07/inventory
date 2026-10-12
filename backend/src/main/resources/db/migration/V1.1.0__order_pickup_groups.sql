alter table items add column responsible_person_id uuid references app_users;
create index ix_items_responsible_person on items (responsible_person_id);
alter table faction_orders add column pickup_assignments jsonb not null default '{}';
alter table general_orders add column pickup_assignments jsonb not null default '{}';
