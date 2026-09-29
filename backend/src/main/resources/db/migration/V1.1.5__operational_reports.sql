create table operational_reports (
    name varchar(255) primary key,
    version bigint not null default 0,
    started_at timestamptz,
    generated_at timestamptz,
    source_token varchar(8000),
    report_rows jsonb not null default '[]'
);
