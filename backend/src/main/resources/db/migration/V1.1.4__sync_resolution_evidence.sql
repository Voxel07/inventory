alter table sync_command_audit add column supersedes uuid references sync_command_audit(command_id);
alter table sync_command_audit add column resolution_root uuid references sync_command_audit(command_id);
create index idx_sync_resolution_root on sync_command_audit(resolution_root);
alter table sync_command_audit add column resolution_note varchar(2000);
