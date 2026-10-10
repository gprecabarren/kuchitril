import type { APIRoute } from 'astro';
import { adminGuard, json } from '../../../../../lib/auth';
import { getSupabaseAdmin } from '../../../../../lib/supabase';
import { tables, schemas, validateContent, smallJson, type ContentKind } from '../../../../../lib/cms-validation';

export const GET: APIRoute = async (context) => {
  const { response } = await adminGuard(context); if (response) return response;
  const kind = context.params.kind as ContentKind;
  if (!Object.hasOwn(schemas, kind)) return json({ error: 'Sección no encontrada.' }, 404);
  const db = getSupabaseAdmin(); if (!db) return json({ error: 'El gestor no está conectado.' }, 503);
  const query = db.from(tables[kind]).select('*');
  const result = kind === 'settings' ? await query.eq('id', 1).single() : await query.order('sort_order').order('created_at').limit(500);
  return result.error ? json({ error: 'No pudimos cargar los datos. Vuelve a intentarlo.' }, 503) : json({ data: result.data });
};

export const POST: APIRoute = async (context) => {
  const { response, user } = await adminGuard(context, true); if (response || !user) return response!;
  const kind = context.params.kind as ContentKind;
  if (!Object.hasOwn(schemas, kind) || kind === 'settings') return json({ error: 'Sección no encontrada.' }, 404);
  const db = getSupabaseAdmin(); if (!db) return json({ error: 'El gestor no está conectado.' }, 503);
  try {
    const data = validateContent(kind, await smallJson(context.request), false);
    const { data: row, error } = await db.from(tables[kind]).insert({ ...data, updated_by: user.id } as never).select().single();
    return error ? json({ error: 'No pudimos guardar. Revisa los campos e inténtalo nuevamente.' }, 400) : json({ data: row }, 201);
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Datos no válidos.' }, 400); }
};
