alter table storage_locations add column parent_location_id uuid references storage_locations(id);
alter table storage_locations add constraint storage_location_not_own_parent check (parent_location_id <> id);
create index idx_location_parent on storage_locations(parent_location_id);
