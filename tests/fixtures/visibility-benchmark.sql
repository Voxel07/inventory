\set ON_ERROR_STOP on
insert into app_users(id,created_at,updated_at,issuer,external_subject,name,role,roles,factions) values
('10000000-0000-0000-0000-000000000001',(extract(epoch from now()) * 1000)::bigint,(extract(epoch from now()) * 1000)::bigint,'fixture','viewer','Performance reader','warehouse_crew','["warehouse_crew"]','[]'),
('10000000-0000-0000-0000-000000000002',(extract(epoch from now()) * 1000)::bigint,(extract(epoch from now()) * 1000)::bigint,'fixture','owner','Performance owner','read_only','["read_only"]','[]');
insert into storage_locations(id,created_at,updated_at,name,code,full_code,active,map_zoom) values ('20000000-0000-0000-0000-000000000001',(extract(epoch from now()) * 1000)::bigint,(extract(epoch from now()) * 1000)::bigint,'Performance site','SITE','SITE',true,16);
insert into storage_locations(id,parent_location_id,created_at,updated_at,name,code,full_code,active,map_zoom) values ('20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',(extract(epoch from now()) * 1000)::bigint,(extract(epoch from now()) * 1000)::bigint,'Performance section','SECTION','SITE-SECTION',true,16);
insert into inventory_access_policies(id,created_at,updated_at,owner_user_id,revision)
select md5('policy-'||n)::uuid,(extract(epoch from now()) * 1000)::bigint,(extract(epoch from now()) * 1000)::bigint,'10000000-0000-0000-0000-000000000002',0 from generate_series(1,10000) n where n%5=0;
insert into inventory_access_grants(id,created_at,updated_at,policy_id,user_id,can_edit)
select md5('grant-'||n)::uuid,(extract(epoch from now()) * 1000)::bigint,(extract(epoch from now()) * 1000)::bigint,md5('policy-'||n)::uuid,'10000000-0000-0000-0000-000000000001',false from generate_series(1,10000) n where n%40=0;
insert into items(id,created_at,updated_at,name,sku,category,active,current_operating_hours,min_stock,unit_value_cents,inventory_role,out_of_service,tracking_mode,event_tags,access_policy_id,storage_location_id)
select md5('item-'||n)::uuid,(extract(epoch from now()) * 1000)::bigint,(extract(epoch from now()) * 1000)::bigint,'Performance item '||n,'PERF-'||n,'Performance',true,0,0,0,'returnable',false,'bulk','[]',case when n%5=0 then md5('policy-'||n)::uuid end,'20000000-0000-0000-0000-000000000002' from generate_series(1,10000) n;
insert into stock_transactions(id,created_at,updated_at,occurred_at,quantity,item_id,user_id,type,source_location_id)
select md5('movement-'||n)::uuid,(extract(epoch from now()) * 1000)::bigint,(extract(epoch from now()) * 1000)::bigint,(extract(epoch from now()) * 1000)::bigint - n::bigint * 1000,1,md5('item-'||((n-1)%10000+1))::uuid,'10000000-0000-0000-0000-000000000001','added','20000000-0000-0000-0000-000000000002' from generate_series(1,100000) n;
analyze;
