-- Isolated, non-sensitive singleton for the public Data API health check.
-- Never add website content or personal information to this table.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';

create table public.health_check (
  id smallint primary key check (id = 1)
);

alter table public.health_check enable row level security;
revoke all on table public.health_check from public, anon, authenticated;
insert into public.health_check (id) values (1);
grant select (id) on table public.health_check to anon;
create policy health_check_read_singleton on public.health_check
  for select to anon using (id = 1);

comment on table public.health_check is 'Public non-sensitive health identifier only. No content or personal data. No API write access.';
commit;
