import type { APIRoute } from 'astro';
import { z } from 'zod';
import { env } from 'node:process';
import { adminGuard, json } from '../../../../lib/auth';
import { getSupabaseAdmin, getSupabaseUrl, MEDIA_BUCKETS, MEDIA_LIMITS } from '../../../../lib/supabase';
import { smallJson } from '../../../../lib/cms-validation';

const uploadRequest = z.object({ filename: z.string().min(1).max(240), mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']), size: z.number().int().positive().max(MEDIA_LIMITS.videoBytes) }).strict();
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' };

export const POST: APIRoute = async (context) => {
  const { response, user } = await adminGuard(context, true); if (response || !user) return response!;
  const db = getSupabaseAdmin(); if (!db) return json({ error: 'El gestor no está conectado.' }, 503);
  try {
    const input = uploadRequest.safeParse(await smallJson(context.request));
    if (!input.success) return json({ error: 'Selecciona una imagen JPG, PNG o WebP, o un video MP4 o WebM.' }, 400);
    const { mime, size } = input.data;
    const video = mime.startsWith('video/');
    if (!video && size > MEDIA_LIMITS.imageBytes) return json({ error: 'La fotografía debe pesar hasta 10 MB.' }, 400);
    const { count, error: countError } = await db.from('cms_media').select('id', { count: 'exact', head: true }).eq('created_by', user.id).gte('created_at', new Date(Date.now() - 3600000).toISOString());
    if (countError) return json({ error: 'No pudimos preparar la carga.' }, 503);
    if ((count || 0) >= 60) return json({ error: 'Has cargado muchos archivos. Inténtalo dentro de una hora.' }, 429);
    const id = crypto.randomUUID();
    // Original filenames never appear in public URLs or logs.
    const path = `${user.id}/${id}.${extensions[mime]}`;
    const { error: rowError } = await db.from('cms_media').insert({ id, staging_path: path, bucket: video ? MEDIA_BUCKETS.videos : MEDIA_BUCKETS.images, mime_type: mime, size_bytes: size, created_by: user.id });
    if (rowError) return json({ error: 'No pudimos preparar la carga.' }, 503);
    const { data, error } = await db.storage.from(MEDIA_BUCKETS.staging).createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'No pudimos preparar la carga. Inténtalo nuevamente.' }, 503);
    const storageOrigin = getSupabaseUrl().replace('.supabase.co', '.storage.supabase.co');
    return json({ id, signedUrl: data.signedUrl, token: data.token, path, bucket: MEDIA_BUCKETS.staging, tusEndpoint: storageOrigin + '/storage/v1/upload/resumable/sign', apikey: env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.SUPABASE_PUBLISHABLE_KEY }, 201);
  } catch { return json({ error: 'No pudimos preparar el archivo. Revisa su formato y tamaño.' }, 400); }
};
