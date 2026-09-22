create table category_maintenance_policies (
    id uuid not null primary key,
    category varchar(255) not null unique,
    interval_days integer not null check (interval_days > 0),
    created_at timestamp(6) with time zone not null,
    updated_at timestamp(6) with time zone not null
);
