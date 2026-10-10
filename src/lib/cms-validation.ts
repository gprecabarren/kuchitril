import { z } from 'zod';
import { safeExternalUrl, safeMediaUrl } from './content';

const text = (max: number, required = false) => z.string().trim().max(max).refine((v) => !required || v.length > 0, 'Completa este campo.').refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v), 'El texto contiene caracteres no permitidos.');
const image = text(2048).refine((v) => !v || !!safeMediaUrl(v) && /\.(jpe?g|png|webp)$/i.test(v), 'Selecciona una fotografía cargada al gestor.');
const external = text(2048).refine((v) => !v || !!safeExternalUrl(v), 'Utiliza un enlace HTTPS válido.');
const common = { published: z.boolean(), sort_order: z.number().int().min(0).max(9999), deleted_at: z.null() };
const work = z.object({ ...common, title: text(140, true), description: text(4000), client: text(140), category: text(100), image_url: image, image_alt: text(240), link_url: external, featured: z.boolean() }).strict();
const team = z.object({ ...common, name: text(140, true), role: text(240, true), photo_url: image, photo_alt: text(240), exclude_name_from_index: z.boolean() }).strict();
const testimonial = z.object({ ...common, quote: text(2000, true), name: text(140, true), company: text(160), photo_url: image, background_color: z.string().regex(/^#[0-9a-f]{6}$/i), text_color: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict();
const settings = z.object({ home_title: text(100, true), home_description: text(320, true), og_image_url: image, founder_photo_url: image, instagram_url: text(2048).refine((v) => !v || !!safeExternalUrl(v, ['instagram.com', 'www.instagram.com']), 'Utiliza el enlace HTTPS del perfil de Instagram.'), portfolio_url: external.refine(Boolean, 'Completa el enlace del portafolio.'), video_url: text(2048).refine((v) => !v || !!safeMediaUrl(v) && /\/cms-videos\/.+\.(mp4|webm)$/i.test(v), 'Selecciona un video cargado al gestor.'), video_poster_url: image, video_mime: z.enum(['', 'video/mp4', 'video/webm']), video_autoplay: z.boolean() }).strict();
export const schemas = { works: work, team, testimonials: testimonial, settings };
export type ContentKind = keyof typeof schemas;
export const tables = { works: 'works', team: 'team_members', testimonials: 'testimonials', settings: 'site_settings' } as const;

export function validateContent(kind: ContentKind, input: unknown, partial: boolean) {
  const schema = partial ? schemas[kind].partial() : kind === 'settings' ? settings : kind === 'works' ? work.omit({ deleted_at: true }) : kind === 'team' ? team.omit({ deleted_at: true }) : testimonial.omit({ deleted_at: true });
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues[0]?.message || 'Revisa los datos ingresados.');
  const data = result.data as Record<string, unknown>;
  if (kind === 'works' && data.published === true && data.image_url === '') throw new Error('Añade una fotografía antes de publicar el trabajo.');
  if (kind === 'settings' && data.video_url) {
    const expected = String(data.video_url).endsWith('.mp4') ? 'video/mp4' : 'video/webm';
    if (data.video_mime !== expected) throw new Error('El formato del video no coincide. Vuelve a cargarlo.');
  }
  if (kind === 'team' && typeof data.name === 'string' && /^\s*genaro\s+piedra/i.test(data.name)) data.exclude_name_from_index = true;
  if (kind === 'testimonials' && data.background_color && data.text_color) {
    const luminance = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    const a = luminance(String(data.background_color)), b = luminance(String(data.text_color));
    if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 4.5) throw new Error('Elige colores con mayor contraste para que el testimonio se lea bien.');
  }
  return data;
}

export async function smallJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('El formato de la solicitud no es válido.');
  if (Number(request.headers.get('content-length')) > 32768) throw new Error('La solicitud es demasiado grande.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Faltan los datos.');
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.length; if (total > 32768) { await reader.cancel(); throw new Error('La solicitud es demasiado grande.'); }
    chunks.push(value);
  }
  const body = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(body)); } catch { throw new Error('Revisa los datos ingresados.'); }
}
