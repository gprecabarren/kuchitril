begin;
set local lock_timeout = '4s';

alter table public.site_settings
  add column home_copy jsonb not null default '{}'::jsonb
    check (jsonb_typeof(home_copy) = 'object' and octet_length(home_copy::text) <= 24000),
  add column theme_colors jsonb not null default '{}'::jsonb
    check (jsonb_typeof(theme_colors) = 'object' and octet_length(theme_colors::text) <= 1024);

commit;
