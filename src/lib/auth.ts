import { createServerClient } from '@supabase/ssr';
import type { APIContext } from 'astro';
import { env } from 'node:process';
import { getSupabaseUrl } from './supabase';

type AuthContext = Pick<APIContext, 'cookies' | 'request' | 'url'>;
const pendingCookies = new WeakMap<object, Map<string, string>>();
const SESSION_COOKIE_AGE = 60 * 60 * 24 * 7;
const PKCE_COOKIE_AGE = 60 * 10;

function cookieValues(context: AuthContext): Map<string, string> {
  let values = pendingCookies.get(context);
  if (!values) {
    values = new Map();
    for (const item of (context.request.headers.get('cookie') || '').split(';')) {
      const [name, ...rest] = item.trim().split('=');
      if (!name || !rest.length) continue;
      try { values.set(name, decodeURIComponent(rest.join('='))); } catch { /* Ignore malformed cookies. */ }
    }
    pendingCookies.set(context, values);
  }
  return values;
}

export function createAuthClient(context: AuthContext) {
  const url = getSupabaseUrl();
  const key = env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('La conexión de inicio de sesión no está configurada.');
  return createServerClient(url, key, {
    auth: { flowType: 'pkce' },
    cookieOptions: { path: '/', httpOnly: true, secure: context.url.protocol === 'https:', sameSite: 'lax', maxAge: SESSION_COOKIE_AGE },
    cookies: {
      getAll() {
        // Include writes made by an earlier auth client in this same server request.
        return [...cookieValues(context)].map(([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          const deletion = options.maxAge !== undefined && options.maxAge <= 0 || options.expires !== undefined && new Date(options.expires).getTime() <= Date.now();
          if (deletion || !value) cookieValues(context).delete(name);
          else cookieValues(context).set(name, value);
          const maxAge = deletion ? options.maxAge : name.includes('-code-verifier') ? PKCE_COOKIE_AGE : SESSION_COOKIE_AGE;
          context.cookies.set(name, value, { ...options, maxAge, path: '/', httpOnly: true, secure: context.url.protocol === 'https:', sameSite: 'lax' });
        }
      },
    },
  });
}

export async function getAdminUser(context: AuthContext, exchangedClient?: ReturnType<typeof createAuthClient>) {
  try {
    const { data: { user }, error } = await (exchangedClient || createAuthClient(context)).auth.getUser();
    if (error || !user || !user.email_confirmed_at || !user.email) return null;
    const allowed = (env.ADMIN_EMAILS || import.meta.env.ADMIN_EMAILS || '').split(',').map((x: string) => x.trim().toLowerCase()).filter(Boolean);
    // Authorization uses server-confirmed identity and provider metadata, never user_metadata.
    if (!allowed.includes(user.email.toLowerCase()) || !user.identities?.some((identity) => identity.provider === 'custom:vercel')) return null;
    return { id: user.id, email: user.email, name: 'Kuchitril' };
  } catch { return null; }
}

export function authOrigin(context: Pick<APIContext, 'url'>): string {
  if (context.url.origin === 'https://kuchitril.cl') return context.url.origin;
  if (import.meta.env.DEV && ['http://localhost:4321', 'http://127.0.0.1:4321'].includes(context.url.origin)) return context.url.origin;
  throw new Error('El inicio de sesión solo está disponible en el dominio oficial.');
}

export function sameOrigin(request: Request): boolean {
  return request.headers.get('origin') === new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' } });
}

export async function adminGuard(context: APIContext, mutation = false) {
  if (mutation && !sameOrigin(context.request)) return { response: json({ error: 'Esta solicitud no pertenece al panel.' }, 403), user: null };
  const user = await getAdminUser(context);
  return { user, response: user ? null : json({ error: 'Inicia sesión con la cuenta administradora de Vercel.' }, 401) };
}
