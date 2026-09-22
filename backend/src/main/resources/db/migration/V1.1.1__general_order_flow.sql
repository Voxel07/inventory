alter table general_orders add column event_occurrence_id uuid references event_occurrences(id);
alter table general_orders add column status varchar(40) not null default 'draft';
alter table general_orders add column requested_quantities jsonb not null default '{}'::jsonb;
alter table general_orders add column handed_over_quantities jsonb not null default '{}'::jsonb;
alter table general_orders add column returned_quantities jsonb not null default '{}'::jsonb;
alter table general_orders add column consumed_quantities jsonb not null default '{}'::jsonb;
alter table general_orders add column asset_assignments jsonb not null default '{}'::jsonb;
