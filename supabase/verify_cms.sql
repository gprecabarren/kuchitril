-- Read-only verification, safe to run in the client's SQL Editor after migration.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') as anonymous_can_read,
  has_table_privilege('authenticated', c.oid, 'INSERT') as signed_in_can_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as signed_in_can_update,
  has_table_privilege('service_role', c.oid, 'SELECT') as server_can_read,
  has_table_privilege('service_role', c.oid, 'UPDATE') as server_can_update
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('works','team_members','testimonials','site_settings','cms_media')
order by c.relname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id in ('cms-uploads','cms-images','cms-videos') order by id;

select 'works' as collection, count(*) as rows from public.works
union all select 'team_members', count(*) from public.team_members
union all select 'testimonials', count(*) from public.testimonials
union all select 'site_settings', count(*) from public.site_settings;

select count(*) = 1 as genaro_privacy_is_preserved from public.team_members
where id = '72d0f454-dc4a-4e3f-848b-ef7a34093a61' and exclude_name_from_index;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where (schemaname = 'public' and tablename in ('works','team_members','testimonials','site_settings','cms_media'))
  or (schemaname = 'storage' and tablename = 'objects');
