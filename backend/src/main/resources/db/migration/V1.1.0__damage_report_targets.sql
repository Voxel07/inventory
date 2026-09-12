alter table damage_reports alter column item_id drop not null;
alter table damage_reports add column assembly_id uuid;
alter table damage_reports add constraint fk_damage_reports_assembly foreign key (assembly_id) references assemblies;
alter table damage_reports add constraint ck_damage_reports_single_target check (
    (item_id is not null and assembly_id is null)
    or (item_id is null and assembly_id is not null)
);
