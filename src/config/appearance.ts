export const homeFields = [
  { title: 'Portada e introducción', fields: [
    ['hero_first', 'Titular · primera línea', 'La presencia', 30],
    ['hero_second', 'Titular · segunda línea', 'no se improvisa,', 30],
    ['hero_accent', 'Titular · tercera línea destacada', 'se construye.', 30],
    ['hero_slogan', 'Frase debajo del gato', 'Ideas que dejan huella', 65],
    ['ticker_middle', 'Segunda palabra de la franja animada', 'Planificamos', 30],
  ] },
  { title: 'Nuestra filosofía', fields: [
    ['philosophy_label', 'Nombre de la sección', '01 / Nuestra filosofía', 65],
    ['quote', 'Cita', '«La gente olvidará lo que dijiste, olvidará lo que hiciste, pero nunca olvidará cómo la hiciste sentir»', 360],
    ['philosophy_text', 'Texto de filosofía', 'Volvamos al origen y pongamos el foco en la diferenciación, en la experiencia y en la empatía.', 500],
    ['philosophy_highlights', 'Palabras destacadas, separadas por comas', 'origen, diferenciación, empatía', 120],
  ] },
  { title: 'Diego y el equipo', fields: [
    ['founder_title', 'Titular · primera línea', 'Experiencia al servicio de', 65],
    ['founder_accent', 'Titular · segunda línea destacada', 'Tu proyecto', 45],
    ['founder_bio', 'Biografía de Diego', 'El fundador de este laboratorio creativo ha trabajado con grandes marcas a nivel nacional como Volkswagen, Gobierno de Chile, Tiendas Sparta, Salfa Agrícola, Huawei, Fiat, Tramontina Store y Clínica UC Christus, desarrollando, creando e implementando diferentes campañas publicitarias, tanto para medios convencionales como para redes sociales.', 2500],
    ['founder_profession', 'Profesión y especialidades', 'Publicista, redactor, guionista y académico.', 200],
    ['team_title', 'Titular de equipo', 'El equipo.', 60],
    ['team_subtitle', 'Frase debajo del titular', 'Pastelero a sus pasteles', 100],
  ] },
  { title: 'Servicios y contacto', fields: [
    ['services_label', 'Nombre de la sección de servicios', 'Cuatro formas de hacer crecer tu marca', 90],
    ['services_start', 'Titular de servicios · inicio', 'La', 35],
    ['services_accent', 'Titular de servicios · primer destacado', 'idea', 45],
    ['services_middle', 'Titular de servicios · texto central', 'importa, pero el formato la', 75],
    ['services_end', 'Titular de servicios · segundo destacado', 'transforma', 45],
    ['marketing_description', 'Descripción de Marketing digital', '', 500],
    ['web_description', 'Descripción de Desarrollo web', 'Desarrollamos tiendas online y sitios web atractivos, rápidos y optimizados que impulsen tus ventas.', 500],
    ['audiovisual_description', 'Descripción de Audiovisual', '', 500],
    ['branding_description', 'Descripción de Branding', '', 500],
    ['contact_title', 'Titular de contacto', '¿Hablemos?', 50],
  ] },
] as const;

export const themeFields = [
  ['dark', 'Fondo oscuro', '#0c3837'],
  ['deeper', 'Fondo oscuro secundario', '#082b2b'],
  ['cream', 'Fondo claro y texto sobre oscuro', '#f7efdf'],
  ['ink', 'Texto sobre fondo claro', '#103d3a'],
  ['mint', 'Verde de acento sobre oscuro', '#4dff90'],
  ['light_accent', 'Verde de acento sobre claro', '#14735d'],
  ['aqua', 'Turquesa decorativo', '#50bdb5'],
  ['orange', 'Franja animada y resaltados', '#f6a326'],
  ['line_dark', 'Líneas sobre fondo oscuro', '#53736d'],
  ['line_light', 'Líneas sobre fondo claro', '#8a9d92'],
] as const;

const homeEntries = homeFields.flatMap(({ fields }) => [...fields]);
export type HomeKey = typeof homeEntries[number][0];
export type ThemeKey = typeof themeFields[number][0];
export type HomeCopy = Record<HomeKey, string>;
export type ThemeColors = Record<ThemeKey, string>;

export const defaultHome = Object.fromEntries(homeEntries.map(([key, , value]) => [key, value])) as HomeCopy;
export const defaultTheme = Object.fromEntries(themeFields.map(([key, , value]) => [key, value])) as ThemeColors;
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function resolveHome(overrides: Partial<HomeCopy> | undefined): HomeCopy {
  return Object.fromEntries(homeEntries.map(([key, , fallback, max]) => {
    const value = overrides?.[key];
    return [key, typeof value === 'string' && value.length <= max ? value : fallback];
  })) as HomeCopy;
}

export function resolveTheme(overrides: Partial<ThemeColors> | undefined): ThemeColors {
  return Object.fromEntries(themeFields.map(([key, , fallback]) => {
    const value = overrides?.[key];
    return [key, isHexColor(value) ? value : fallback];
  })) as ThemeColors;
}

export function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const themeContrastPairs = [
  ['cream', 'dark'], ['cream', 'deeper'], ['ink', 'cream'], ['mint', 'dark'],
  ['mint', 'deeper'], ['ink', 'mint'], ['ink', 'orange'], ['dark', 'orange'],
  ['light_accent', 'cream'],
] as const satisfies ReadonlyArray<readonly [ThemeKey, ThemeKey]>;

/** Separate copy into text and highlighted words without rendering HTML from the CMS. */
export function highlightWords(text: string, words: string): { text: string; highlighted: boolean }[] {
  const targets = new Set(words.split(',').map((word) => word.trim().toLocaleLowerCase('es')).filter(Boolean));
  const escaped = [...targets].sort((a, b) => b.length - a.length).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return [{ text, highlighted: false }];
  const pattern = new RegExp(`((?<![\\p{L}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{N}]))`, 'giu');
  return text.split(pattern).map((segment, index) => ({ text: segment, highlighted: index % 2 === 1 }));
}
