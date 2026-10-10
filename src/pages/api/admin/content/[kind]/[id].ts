import type { APIRoute } from 'astro';
import { adminGuard, json } from '../../../../../lib/auth';
import { getSupabaseAdmin } from '../../../../../lib/supabase';
import { tables, schemas, validateContent, smallJson, type ContentKind } from '../../../../../lib/cms-validation';

export const PATCH: APIRoute = async (context) => {
  const { response, user } = await adminGuard(context, true); if (response || !user) return response!;
  const kind = context.params.kind as ContentKind, id = context.params.id || '';
  if (!Object.hasOwn(schemas, kind) || (kind === 'settings' ? id !== '1' : !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return json({ error: 'Contenido no encontrado.' }, 404);
  const db = getSupabaseAdmin(); if (!db) return json({ error: 'El gestor no está conectado.' }, 503);
  try {
    const data = validateContent(kind, await smallJson(context.request), true);
    if (!Object.keys(data).length) return json({ error: 'No hay cambios para guardar.' }, 400);
    const { data: existing, error: readError } = await db.from(tables[kind]).select('*').eq('id', kind === 'settings' ? 1 : id).maybeSingle();
    if (readError) return json({ error: 'No pudimos cargar el contenido para actualizarlo.' }, 503);
    if (!existing) return json({ error: 'Contenido no encontrado.' }, 404);
    const merged = { ...existing, ...data } as Record<string, unknown>;
    const fields = Object.keys(schemas[kind].shape).filter((key) => key !== 'deleted_at');
    const validated = validateContent(kind, Object.fromEntries(fields.map((key) => [key, merged[key]])), false);
    if (kind === 'team' && validated.exclude_name_from_index === true) data.exclude_name_from_index = true;
    const { data: row, error } = await db.from(tables[kind]).update({ ...data, updated_by: user.id } as never).eq('id', kind === 'settings' ? 1 : id).select().maybeSingle();
    if (error) return json({ error: 'No pudimos guardar. Revisa los campos e inténtalo nuevamente.' }, 400);
    return row ? json({ data: row }) : json({ error: 'Contenido no encontrado.' }, 404);
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Datos no válidos.' }, 400); }
};

export const DELETE: APIRoute = async (context) => {
  const { response, user } = await adminGuard(context, true); if (response || !user) return response!;
  const kind = context.params.kind as ContentKind, id = context.params.id || '';
  if (!Object.hasOwn(schemas, kind) || kind === 'settings' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: 'Contenido no encontrado.' }, 404);
  const db = getSupabaseAdmin(); if (!db) return json({ error: 'El gestor no está conectado.' }, 503);
  const { data, error } = await db.from(tables[kind]).update({ deleted_at: new Date().toISOString(), published: false, updated_by: user.id }).eq('id', id).select().maybeSingle();
  return error ? json({ error: 'No pudimos archivar el contenido.' }, 503) : data ? json({ data }) : json({ error: 'Contenido no encontrado.' }, 404);
};
