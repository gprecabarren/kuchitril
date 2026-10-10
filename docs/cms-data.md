# Contenido de Kuchitril

## Propiedad e integración

El proyecto de Supabase pertenece al cliente. Las credenciales se configuran como variables privadas del servidor de Vercel, nunca como `PUBLIC_*` ni en el repositorio. La sesión del administrador usa Supabase Auth con el proveedor OIDC de Vercel; iniciar sesión no concede acceso directo a las tablas.

- `SUPABASE_URL`: URL HTTPS del proyecto de Kuchitril.
- `SUPABASE_PUBLISHABLE_KEY`: clave publicable usada por Auth.
- `SUPABASE_SECRET_KEY`: clave secreta usada únicamente por las funciones de servidor.
- El servidor debe comprobar el proveedor de identidad y la lista de administradores antes de cada lectura privada, cambio o autorización de carga.

Dependencia verificada: `@supabase/supabase-js` **2.117.3**, fijada sin `^` ni `~` y con el lockfile del proyecto. No se necesita una conexión PostgreSQL directa ni el complemento IPv4 para esta integración mediante la API de datos.

## Migración

El archivo `supabase/migrations/20261010170424_kuchitril_cms.sql` se creó con `supabase migration new kuchitril_cms` usando CLI 2.111.0. Puede aplicarse mediante el flujo de migraciones o en el editor SQL de la cuenta del cliente; en este último caso, debe mantenerse un registro de la aplicación para no ejecutarlo dos veces. Es una transacción completa.

`supabase/verify_cms.sql` comprueba RLS, permisos, buckets y datos iniciales sin modificarlos. La verificación de permisos debe devolver:

- RLS activo en las cinco tablas.
- Sin lectura anónima ni escritura para `authenticated`.
- Lectura y actualización para `service_role`.
- `cms-uploads` privado; `cms-images` y `cms-videos` públicos.
- Tres integrantes reales, una fila de ajustes, cero trabajos y cero testimonios ficticios.

Las tablas tienen RLS **sin políticas públicas de acceso**, además de permisos explícitos revocados para `anon` y `authenticated`. Esta denegación es intencional: todas las consultas pasan por el servidor. Las funciones auxiliares viven en `cms_private`, con `search_path` vacío y `SECURITY INVOKER`.

## Contratos de contenido

Los tipos se encuentran en `src/types/cms.ts`. Las colecciones tienen `id`, `published`, `sort_order`, `deleted_at`, `created_at`, `updated_at` y `updated_by`. `updated_by` es el identificador del administrador; no se expone en contenido público.

| Entidad del panel | Tabla | Campos específicos |
| --- | --- | --- |
| Trabajos | `works` | `title`, `description`, `client`, `category`, `image_url`, `image_alt`, `link_url`, `featured` |
| Equipo | `team_members` | `name`, `role`, `photo_url`, `photo_alt`, `exclude_name_from_index` |
| Testimonios | `testimonials` | `quote`, `name`, `company`, `photo_url`, `background_color`, `text_color` |
| Configuración | `site_settings` | `home_title`, `home_description`, `og_image_url`, `instagram_url`, `portfolio_url`, `video_url`, `video_poster_url`, `video_mime`, `video_autoplay`, `founder_photo_url` |

`site_settings` es un registro único con `id = 1`. Los textos son texto plano; Astro debe escaparlos al mostrarlos. Los colores solo aceptan hexadecimal de seis cifras. Los enlaces externos requieren HTTPS y los enlaces de Instagram pertenecen exclusivamente a `instagram.com`.

`published = false` conserva un borrador. `deleted_at` permite archivar y recuperar una entrada sin destruirla. El inicio muestra hasta cinco trabajos publicados, destacados y sin archivar; hasta treinta integrantes y hasta treinta testimonios. Los índices parciales corresponden a estos filtros y su orden.

## Lecturas públicas y privacidad de integrantes

`getSiteContent()` devuelve `{works, team, testimonials, settings, configured}`. Solo devuelve contenido publicado y sin archivar. `configured` es falso si faltan credenciales o falla una consulta, lo que permite conservar la presentación de respaldo. Una base conectada con una colección vacía devuelve `configured = true`, de modo que eliminar o archivar integrantes tenga efecto.

`getSiteSettings()` consulta solo la configuración. `getAdminContent()` devuelve las colecciones con borradores y archivos; su llamador debe autorizar la sesión primero. No importar estos módulos en scripts de navegador.

La fila de Genaro tiene `exclude_name_from_index = true`, y una restricción impide quitar esa protección mientras el nombre empiece por Genaro Piedra. La lectura pública borra su nombre y texto alternativo; la fotografía usa un nombre de archivo aleatorio. Su nombre se muestra exclusivamente en un documento aparte mediante `getTeamMemberName(id)`, con `noindex`, `nofollow`, `nosnippet` y un encabezado `X-Robots-Tag`. No poner ese nombre en el HTML padre, nombres de archivos, alt, JSON-LD, sitemap ni eventos de Analytics. Esta medida controla el sitio de Kuchitril; no elimina menciones ya existentes en otras fuentes.

## Cargas de imágenes y videos

Los archivos no viajan completos por una función de Vercel. El servidor autoriza una carga directa a `cms-uploads`, cuya URL firmada solo recibe un administrador autorizado. El token de carga temporal no es una clave secreta del proyecto.

| Bucket | Público | Tamaño máximo | Tipos |
| --- | --- | --- | --- |
| `cms-uploads` | No | 50 MiB | JPEG, PNG, WebP, MP4, WebM |
| `cms-images` | Sí | 10 MiB | JPEG, PNG, WebP |
| `cms-videos` | Sí | 50 MiB | MP4, WebM |

`cms_media` registra `id`, `staging_path`, `public_path`, `bucket`, `mime_type`, `size_bytes`, `status`, `created_by`, `created_at`, `updated_at`. El flujo esperado es:

1. El servidor comprueba sesión, administrador, origen/CSRF, tamaño declarado y tipo permitido; crea una ruta aleatoria y una fila `pending` perteneciente al administrador.
2. El navegador carga directamente a la URL firmada privada, con progreso y errores visibles. No se permite sobrescribir rutas ajenas.
3. La confirmación de carga vuelve a autorizar al administrador y comprueba que la fila pendiente le pertenece; valida tamaño real, tipo y firma del archivo, sin confiar en la extensión o MIME declarado por el navegador.
4. El servidor copia el archivo validado al bucket público y marca la fila `ready` con su ruta final; elimina el original de staging. Solo entonces entrega la URL pública al formulario.
5. En rechazo, marca `rejected` y elimina el objeto privado. Los archivos sin referencias deben eliminarse al revisar almacenamiento; no borrar un archivo usado por otra entrada.

Las imágenes se recortan y exportan en el navegador antes de subirlas. El recorte no autoriza el contenido: el servidor sigue validando el resultado. SVG y HTML quedan excluidos. Los nombres aleatorios evitan divulgar nombres personales y permiten cachear de forma estable sin reemplazos ambiguos.

Los videos aceptan MP4/WebM hasta el límite del plan gratuito. Para videos largos, preparar un MP4 H.264/AAC optimizado para reproducción progresiva, con poster y controles. No descargar un video completo automáticamente antes de reproducirlo; usar `preload="metadata"`. Si se elige autoplay, el navegador exige normalmente `muted` y `playsinline`. Validar reproducción real en Safari móvil y Chrome; el contenedor MP4 por sí solo no garantiza compatibilidad de todos los códecs.

## Documentación contrastada

Consultada el 10 de octubre de 2026:

- [Changelog de Supabase](https://supabase.com/changelog.md): no cambio relevante para este esquema; se respeta el cambio a permisos explícitos en tablas nuevas. Node 22 es compatible con los requisitos actuales del cliente.
- [Permisos y RLS de la API](https://supabase.com/docs/guides/api/securing-your-api).
- [Seguridad de las claves secretas](https://supabase.com/docs/guides/database/secure-data).
- [Crear buckets con límites](https://supabase.com/docs/guides/storage/buckets/creating-buckets).
- [Límites de archivos: Free no supera 50 MB](https://supabase.com/docs/guides/storage/uploads/file-limits).
- [URL firmada de carga: validez de dos horas](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl).
- [Descargas públicas y privadas](https://supabase.com/docs/guides/storage/serving/downloads).

El estado final de provisión y las pruebas del proyecto remoto deben registrarse después de aplicar la migración y configurar los proveedores.
