import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from 'node:process';
import type { Database } from '../types/cms';

let adminClient: SupabaseClient<Database> | undefined;

function serverEnv(name: string): string {
  // Runtime environment takes precedence so secret rotation does not require a build.
  return env[name] || import.meta.env[name] || '';
}

export function getSupabaseUrl(): string {
  const value = serverEnv('SUPABASE_URL');
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

/** Server only. Never import this module in browser scripts or expose its client. */
export function getSupabaseAdmin(): SupabaseClient<Database> | null {
  if (!import.meta.env.SSR) throw new Error('El cliente de administración solo puede ejecutarse en el servidor.');
  if (adminClient) return adminClient;
  const url = getSupabaseUrl();
  const key = serverEnv('SUPABASE_SECRET_KEY');
  if (!url || !key) return null;
  adminClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return adminClient;
}

export const MEDIA_BUCKETS = { images: 'cms-images', videos: 'cms-videos', staging: 'cms-uploads' } as const;
export const MEDIA_LIMITS = { imageBytes: 10 * 1024 * 1024, videoBytes: 50 * 1024 * 1024 } as const;
