import { site } from '../config/site';
import { getSupabaseAdmin, getSupabaseUrl } from './supabase';
import type { SiteContent, SiteSettings, TeamMember, Testimonial, Work } from '../types/cms';
export type { SiteContent, SiteSettings, TeamMember, Testimonial, Work } from '../types/cms';

export const GENARO_MEMBER_ID = '72d0f454-dc4a-4e3f-848b-ef7a34093a61';

export const defaultSettings: SiteSettings = {
  id: 1,
  home_title: 'Kuchitril | Agencia de publicidad · Ideas que dejan huella',
  home_description: site.description,
  og_image_url: '/assets/kuchitril-referencia.webp',
  instagram_url: '',
  portfolio_url: site.portfolio,
  video_url: '',
  video_poster_url: '',
  video_mime: '',
  video_autoplay: false,
  founder_photo_url: '/assets/fundador.webp',
  created_at: '',
  updated_at: '',
  updated_by: null,
};

/** Returns only HTTPS destinations with no credentials, queries, or fragments. */
export function safeExternalUrl(value: unknown, allowedHosts?: string[]): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')) return '';
    if (allowedHosts && !allowedHosts.includes(url.hostname.toLowerCase())) return '';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

/** Media comes only from packaged assets or the client's approved public buckets. */
export function safeMediaUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) return '';
  if (/^\/assets\/[A-Za-z0-9/_\.-]+\.(?:jpg|jpeg|png|webp)$/.test(value) && !value.includes('..')) return value;
  const origin = getSupabaseUrl();
  if (!origin) return '';
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash) return '';
    if (!/^\/storage\/v1\/object\/public\/(?:cms-images\/[A-Za-z0-9/_\.-]+\.(?:jpg|jpeg|png|webp)|cms-videos\/[A-Za-z0-9/_\.-]+\.(?:mp4|webm))$/.test(url.pathname) || url.pathname.includes('..')) return '';
    return url.href;
  } catch {
    return '';
  }
}

function sanitizeSettings(settings: SiteSettings): SiteSettings {
  const videoMime = settings.video_mime === 'video/mp4' || settings.video_mime === 'video/webm' ? settings.video_mime : '';
  return {
    ...settings,
    home_title: settings.home_title?.trim() || defaultSettings.home_title,
    home_description: settings.home_description?.trim() || defaultSettings.home_description,
    og_image_url: safeMediaUrl(settings.og_image_url) || defaultSettings.og_image_url,
    instagram_url: safeExternalUrl(settings.instagram_url, ['instagram.com', 'www.instagram.com']),
    portfolio_url: safeExternalUrl(settings.portfolio_url) || site.portfolio,
    video_url: videoMime ? safeMediaUrl(settings.video_url) : '',
    video_poster_url: safeMediaUrl(settings.video_poster_url),
    video_mime: videoMime,
    // Muted autoplay must remain an explicit client choice.
    video_autoplay: settings.video_autoplay === true,
    founder_photo_url: safeMediaUrl(settings.founder_photo_url) || '/assets/fundador.webp',
    updated_by: null,
  };
}

function sanitizeTeamMember(member: TeamMember): TeamMember {
  const privateName = member.exclude_name_from_index || /^\s*genaro\s+piedra/i.test(member.name);
  return {
    ...member,
    name: privateName ? '' : member.name,
    photo_url: safeMediaUrl(member.photo_url),
    photo_alt: privateName ? 'Integrante del equipo' : member.photo_alt,
    exclude_name_from_index: privateName,
    updated_by: null,
  };
}

function logContentFailure(code?: string): void {
  // Keep names, row contents, API keys, and database diagnostics out of logs.
  console.warn('[Kuchitril CMS] No se pudo leer el contenido publicado.', code || 'unavailable');
}

/** Server-rendered public content. No drafts, archived records, or private names. */
export async function getSiteContent(): Promise<SiteContent> {
  const fallback: SiteContent = { works: [], team: [], testimonials: [], settings: { ...defaultSettings }, configured: false };
  const db = getSupabaseAdmin();
  if (!db) return fallback;
  try {
    const [works, team, testimonials, settings] = await Promise.all([
      db.from('works').select('*').eq('published', true).eq('featured', true).is('deleted_at', null).order('sort_order').order('created_at').limit(5).abortSignal(AbortSignal.timeout(6000)),
      db.from('team_members').select('*').eq('published', true).is('deleted_at', null).order('sort_order').order('created_at').limit(30).abortSignal(AbortSignal.timeout(6000)),
      db.from('testimonials').select('*').eq('published', true).is('deleted_at', null).order('sort_order').order('created_at').limit(30).abortSignal(AbortSignal.timeout(6000)),
      db.from('site_settings').select('*').eq('id', 1).abortSignal(AbortSignal.timeout(6000)).single(),
    ]);
    const failure = [works.error, team.error, testimonials.error, settings.error].find(Boolean);
    if (failure || !settings.data) {
      logContentFailure(failure?.code);
      return fallback;
    }
    return {
      configured: true,
      works: (works.data || []).map((row: Work) => ({ ...row, image_url: safeMediaUrl(row.image_url), link_url: safeExternalUrl(row.link_url), updated_by: null })),
      team: (team.data || []).map(sanitizeTeamMember),
      testimonials: (testimonials.data || []).map((row: Testimonial) => ({
        ...row,
        photo_url: safeMediaUrl(row.photo_url),
        background_color: /^#[0-9a-f]{6}$/i.test(row.background_color) ? row.background_color : '#d9f0d5',
        text_color: /^#[0-9a-f]{6}$/i.test(row.text_color) ? row.text_color : '#173e35',
        updated_by: null,
      })),
      settings: sanitizeSettings(settings.data),
    };
  } catch {
    logContentFailure();
    return fallback;
  }
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const db = getSupabaseAdmin();
  if (!db) return { ...defaultSettings };
  try {
    const { data, error } = await db.from('site_settings').select('*').eq('id', 1).abortSignal(AbortSignal.timeout(6000)).single();
    if (error || !data) {
      logContentFailure(error?.code);
      return { ...defaultSettings };
    }
    return sanitizeSettings(data);
  } catch {
    logContentFailure();
    return { ...defaultSettings };
  }
}

/** Used only by the separate noindex iframe document. */
export async function getTeamMemberName(id = GENARO_MEMBER_ID): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return '';
  const db = getSupabaseAdmin();
  if (!db) return id === GENARO_MEMBER_ID ? 'Genaro Piedra Recabarren' : '';
  try {
    const { data, error } = await db.from('team_members').select('name').eq('id', id).eq('published', true).is('deleted_at', null).abortSignal(AbortSignal.timeout(6000)).maybeSingle();
    if (error) return '';
    return data?.name || '';
  } catch {
    return '';
  }
}

/** Call only after the server has authenticated and authorized a CMS administrator. */
export async function getAdminContent(): Promise<SiteContent> {
  const db = getSupabaseAdmin();
  if (!db) throw new Error('El gestor de contenido todavía no está conectado.');
  const [works, team, testimonials, settings] = await Promise.all([
    db.from('works').select('*').order('sort_order').order('created_at').limit(500).abortSignal(AbortSignal.timeout(10000)),
    db.from('team_members').select('*').order('sort_order').order('created_at').limit(100).abortSignal(AbortSignal.timeout(10000)),
    db.from('testimonials').select('*').order('sort_order').order('created_at').limit(500).abortSignal(AbortSignal.timeout(10000)),
    db.from('site_settings').select('*').eq('id', 1).abortSignal(AbortSignal.timeout(10000)).single(),
  ]);
  if ([works.error, team.error, testimonials.error, settings.error].some(Boolean) || !settings.data) throw new Error('No pudimos cargar el contenido. Vuelve a intentarlo.');
  return { works: works.data || [], team: team.data || [], testimonials: testimonials.data || [], settings: settings.data, configured: true };
}
