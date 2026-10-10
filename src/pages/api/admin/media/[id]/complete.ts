import type { APIRoute } from 'astro';
import { adminGuard, json } from '../../../../../lib/auth';
import { getSupabaseAdmin, MEDIA_BUCKETS } from '../../../../../lib/supabase';

function matchesFile(bytes: Uint8Array, mime: string) {
  const ascii = (a: number, b: number) => new TextDecoder().decode(bytes.slice(a, b));
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (mime === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (mime === 'video/mp4') return ascii(4, 8) === 'ftyp';
  if (mime === 'video/webm') return [26, 69, 223, 163].every((v, i) => bytes[i] === v) && ascii(0, 4096).includes('webm');
  return false;
}

export const POST: APIRoute = async (context) => {
  const { response, user } = await adminGuard(context, true); if (response || !user) return response!;
  const id = context.params.id || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: 'Archivo no encontrado.' }, 404);
  const db = getSupabaseAdmin(); if (!db) return json({ error: 'El gestor no está conectado.' }, 503);
  try {
    const { data: media, error } = await db.from('cms_media').select('*').eq('id', id).eq('created_by', user.id).maybeSingle();
    if (error || !media) return json({ error: 'Archivo no encontrado.' }, 404);
    if (media.status === 'ready' && media.public_path) return json({ publicUrl: db.storage.from(media.bucket).getPublicUrl(media.public_path).data.publicUrl });
    if (media.status !== 'pending') return json({ error: 'Este archivo no es válido. Cárgalo nuevamente.' }, 400);
    const staging = db.storage.from(MEDIA_BUCKETS.staging);
    const { data: info, error: infoError } = await staging.info(media.staging_path);
    if (infoError || !info) return json({ error: 'La carga aún no terminó. Inténtalo nuevamente.' }, 409);
    if (info.size !== media.size_bytes || info.contentType !== media.mime_type) {
      await db.from('cms_media').update({ status: 'rejected' }).eq('id', id);
      await staging.remove([media.staging_path]);
      return json({ error: 'El tamaño o el tipo del archivo no coincide. Cárgalo nuevamente.' }, 400);
    }
    const { data: signed, error: signError } = await staging.createSignedUrl(media.staging_path, 60);
    if (signError || !signed) return json({ error: 'No pudimos validar el archivo.' }, 503);
    const sample = await fetch(signed.signedUrl, { headers: { Range: 'bytes=0-4095' }, signal: AbortSignal.timeout(15000) });
    if (!sample.ok || !sample.body) return json({ error: 'No pudimos validar el archivo.' }, 503);
    const reader = sample.body.getReader(), bytes = new Uint8Array(4096); let length = 0;
    while (length < bytes.length) {
      const { done, value } = await reader.read(); if (done) break;
      const part = value.slice(0, bytes.length - length); bytes.set(part, length); length += part.length;
    }
    await reader.cancel();
    if (!matchesFile(bytes.slice(0, length), media.mime_type)) {
      await db.from('cms_media').update({ status: 'rejected' }).eq('id', id);
      await staging.remove([media.staging_path]);
      return json({ error: 'El contenido del archivo no corresponde a una imagen o video admitido.' }, 400);
    }
    const extension = media.staging_path.split('.').pop();
    const finalPath = `${id}.${extension}`;
    const { error: copyError } = await staging.copy(media.staging_path, finalPath, { destinationBucket: media.bucket });
    if (copyError) {
      // Retry safely if the validated copy succeeded but its database update was interrupted.
      const { data: existing } = await db.storage.from(media.bucket).info(finalPath);
      if (!existing || existing.size !== media.size_bytes) return json({ error: 'No pudimos publicar el archivo. Vuelve a intentarlo.' }, 503);
    }
    const { error: updateError } = await db.from('cms_media').update({ status: 'ready', public_path: finalPath }).eq('id', id).eq('created_by', user.id);
    if (updateError) return json({ error: 'No pudimos finalizar la carga. Vuelve a intentarlo.' }, 503);
    await staging.remove([media.staging_path]);
    return json({ publicUrl: db.storage.from(media.bucket).getPublicUrl(finalPath).data.publicUrl });
  } catch { return json({ error: 'No pudimos finalizar la carga. Vuelve a intentarlo.' }, 503); }
};
