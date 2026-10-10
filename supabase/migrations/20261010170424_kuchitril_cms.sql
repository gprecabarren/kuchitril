-- Kuchitril CMS: the browser uses the site's protected APIs, never a privileged key.
-- RLS intentionally has no anon/authenticated policies. All CMS access is server-only.
begin;

create schema if not exists cms_private;
revoke all on schema cms_private from public, anon, authenticated;
grant usage on schema cms_private to service_role;

create function cms_private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function cms_private.touch_updated_at() from public, anon, authenticated;
grant execute on function cms_private.touch_updated_at() to service_role;

create table public.works (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 140),
  description text not null default '' check (char_length(description) <= 4000),
  client text not null default '' check (char_length(client) <= 140),
  category text not null default '' check (char_length(category) <= 100),
  image_url text not null default '' check (char_length(image_url) <= 2048 and (image_url = '' or image_url ~ '^(/assets/[A-Za-z0-9/_\.-]+|https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cms-images/[A-Za-z0-9/_\.-]+)\.(jpg|jpeg|png|webp)$')),
  image_alt text not null default '' check (char_length(image_alt) <= 240),
  link_url text not null default '' check (char_length(link_url) <= 2048 and (link_url = '' or link_url ~ '^https://')),
  featured boolean not null default true,
  published boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text check (char_length(updated_by) <= 200)
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 140),
  role text not null check (char_length(btrim(role)) between 1 and 240),
  photo_url text not null default '' check (char_length(photo_url) <= 2048 and (photo_url = '' or photo_url ~ '^(/assets/[A-Za-z0-9/_\.-]+|https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cms-images/[A-Za-z0-9/_\.-]+)\.(jpg|jpeg|png|webp)$')),
  photo_alt text not null default '' check (char_length(photo_alt) <= 240),
  exclude_name_from_index boolean not null default false,
  published boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text check (char_length(updated_by) <= 200),
  constraint genaro_name_remains_noindex check (name !~* '^\s*genaro\s+piedra' or exclude_name_from_index)
);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null check (char_length(btrim(quote)) between 1 and 2000),
  name text not null check (char_length(btrim(name)) between 1 and 140),
  company text not null default '' check (char_length(company) <= 160),
  photo_url text not null default '' check (char_length(photo_url) <= 2048 and (photo_url = '' or photo_url ~ '^(/assets/[A-Za-z0-9/_\.-]+|https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cms-images/[A-Za-z0-9/_\.-]+)\.(jpg|jpeg|png|webp)$')),
  background_color text not null default '#d9f0d5' check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  text_color text not null default '#173e35' check (text_color ~ '^#[0-9a-fA-F]{6}$'),
  published boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text check (char_length(updated_by) <= 200)
);

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  home_title text not null default 'Kuchitril | Agencia de publicidad · Ideas que dejan huella' check (char_length(btrim(home_title)) between 1 and 100),
  home_description text not null default 'Agencia de publicidad en Concepción: marketing digital, desarrollo web, audiovisual y branding. Trabajamos también en Santiago. Ideas que dejan huella.' check (char_length(btrim(home_description)) between 1 and 320),
  og_image_url text not null default '/assets/kuchitril-referencia.webp' check (char_length(og_image_url) <= 2048 and (og_image_url = '' or og_image_url ~ '^(/assets/[A-Za-z0-9/_\.-]+|https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cms-images/[A-Za-z0-9/_\.-]+)\.(jpg|jpeg|png|webp)$')),
  instagram_url text not null default '' check (char_length(instagram_url) <= 2048 and (instagram_url = '' or instagram_url ~ '^https://(www\.)?instagram\.com/')),
  portfolio_url text not null default 'https://www.behance.net/pesadilla' check (char_length(portfolio_url) <= 2048 and portfolio_url ~ '^https://'),
  video_url text not null default '' check (char_length(video_url) <= 2048 and (video_url = '' or video_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cms-videos/[A-Za-z0-9/_\.-]+\.(mp4|webm)$')),
  video_poster_url text not null default '' check (char_length(video_poster_url) <= 2048 and (video_poster_url = '' or video_poster_url ~ '^(/assets/[A-Za-z0-9/_\.-]+|https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cms-images/[A-Za-z0-9/_\.-]+)\.(jpg|jpeg|png|webp)$')),
  video_mime text not null default '' check (video_mime in ('', 'video/mp4', 'video/webm')),
  video_autoplay boolean not null default false,
  founder_photo_url text not null default '/assets/fundador.webp' check (char_length(founder_photo_url) <= 2048 and (founder_photo_url = '' or founder_photo_url ~ '^(/assets/[A-Za-z0-9/_\.-]+|https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/cms-images/[A-Za-z0-9/_\.-]+)\.(jpg|jpeg|png|webp)$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text check (char_length(updated_by) <= 200),
  constraint presentation_video_has_mime check (video_url = '' or video_mime <> '')
);

create table public.cms_media (
  id uuid primary key default gen_random_uuid(),
  staging_path text not null unique check (char_length(staging_path) <= 240 and staging_path ~ '^[a-zA-Z0-9][a-zA-Z0-9/_\.-]+$' and staging_path not like '%..%'),
  public_path text check (char_length(public_path) <= 240 and public_path ~ '^[a-zA-Z0-9][a-zA-Z0-9/_\.-]+$' and public_path not like '%..%'),
  bucket text not null check (bucket in ('cms-images', 'cms-videos')),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  status text not null default 'pending' check (status in ('pending', 'ready', 'rejected')),
  created_by text not null check (char_length(btrim(created_by)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_bucket_matches_type check (
    (bucket = 'cms-images' and mime_type in ('image/jpeg', 'image/png', 'image/webp') and size_bytes <= 10485760)
    or (bucket = 'cms-videos' and mime_type in ('video/mp4', 'video/webm'))
  ),
  constraint ready_media_has_path check (status <> 'ready' or public_path is not null)
);

alter table public.works enable row level security;
alter table public.team_members enable row level security;
alter table public.testimonials enable row level security;
alter table public.site_settings enable row level security;
alter table public.cms_media enable row level security;

revoke all on table public.works, public.team_members, public.testimonials, public.site_settings, public.cms_media from public, anon, authenticated;
grant select, insert, update, delete on table public.works, public.team_members, public.testimonials, public.cms_media to service_role;
grant select, insert, update on table public.site_settings to service_role;

create index works_public_order_idx on public.works (sort_order, created_at) where published and featured and deleted_at is null;
create index team_public_order_idx on public.team_members (sort_order, created_at) where published and deleted_at is null;
create index testimonials_public_order_idx on public.testimonials (sort_order, created_at) where published and deleted_at is null;
create index cms_media_owner_status_idx on public.cms_media (created_by, status, created_at);

create trigger touch_works before update on public.works for each row execute function cms_private.touch_updated_at();
create trigger touch_team_members before update on public.team_members for each row execute function cms_private.touch_updated_at();
create trigger touch_testimonials before update on public.testimonials for each row execute function cms_private.touch_updated_at();
create trigger touch_site_settings before update on public.site_settings for each row execute function cms_private.touch_updated_at();
create trigger touch_cms_media before update on public.cms_media for each row execute function cms_private.touch_updated_at();

insert into public.site_settings (id) values (1);
insert into public.team_members (id, name, role, exclude_name_from_index, published, sort_order) values
  ('72d0f454-dc4a-4e3f-848b-ef7a34093a61', 'Genaro Piedra Recabarren', 'Programación y Desarrollo web.', true, true, 0),
  ('56b5187b-e447-4fc3-9a60-fdf2a81d3baa', 'Julián Díaz A.', 'Animador multimedia y motiongrapher.', false, true, 1),
  ('47588e40-a9bb-49c9-9a21-16021ee2a6cc', 'Fernanda Lagos', 'Diseño, ilustración y dirección de arte.', false, true, 2);

-- Storage only publishes files after authenticated server validation.
-- No INSERT/UPDATE/DELETE policies are granted to browser Supabase roles.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('cms-uploads', 'cms-uploads', false, 52428800, array['image/jpeg','image/png','image/webp','video/mp4','video/webm']),
  ('cms-images', 'cms-images', true, 10485760, array['image/jpeg','image/png','image/webp']),
  ('cms-videos', 'cms-videos', true, 52428800, array['video/mp4','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
commit;
