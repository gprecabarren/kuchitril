# Kuchitril

Sitio de la agencia y gestor de contenido con **Astro SSR**, TypeScript, Supabase y el adaptador oficial de Vercel. Las animaciones usan GSAP y CSS. Tipografía general DM Sans; Bebas Neue provisional en la marca hasta recibir Stapen con licencia web. Node.js **22** en producción.

## Arquitectura

- El servidor de Astro consulta el contenido publicado en Supabase al recibir la solicitud. Los cambios del panel no necesitan un nuevo despliegue.
- `/admin/` permite gestionar trabajos, equipo, testimonios, video, fotografía de Diego, SEO, Instagram y enlace del portafolio.
- La sesión usa **Sign in with Vercel** mediante el proveedor OIDC `custom:vercel` de Supabase Auth y PKCE. El servidor comprueba correo confirmado, identidad del proveedor y lista de administradores en cada operación.
- Las tablas tienen RLS activo y permisos revocados para `anon` y `authenticated`. Las consultas pasan por las funciones del servidor con una clave secreta; iniciar sesión no concede acceso directo a la base de datos.
- Los archivos se cargan directamente a un bucket privado. El servidor valida propietario, tamaño, tipo y firma del archivo antes de publicarlo. Los videos usan TUS firmado (`/storage/v1/upload/resumable/sign`), con fragmentos de 6 MiB, progreso y reintentos.
- Los archivos publicados admiten caché de un día. Archivar una entrada oculta su contenido; la eliminación definitiva del archivo se gestiona aparte.
- `/admin/`, `/api/` y los documentos de nombres protegidos usan `noindex` y `Cache-Control: private, no-store`. El panel no carga Analytics ni Tag Manager.
- Si faltan credenciales o falla la lectura pública, el sitio conserva su presentación de respaldo. El panel informa los fallos y evita guardar ajustes que no pudo cargar.

Los tipos y el esquema se documentan en [docs/cms-data.md](docs/cms-data.md). La guía para el cliente está en [docs/admin-guide.md](docs/admin-guide.md).

## Cuentas y propiedad

- **Supabase, Vercel y la aplicación de inicio de sesión:** cuenta del cliente `kuchitril.site@gmail.com`.
- **Vercel:** proyecto `kuchitril`, equipo Padi (`padi9`), dominio canónico [kuchitril.cl](https://kuchitril.cl).
- **Región:** Supabase Oregon y funciones Vercel Portland (`us-west-2`, `pdx1`).
- **GitHub:** repositorio `gprecabarren/kuchitril`, rama `main`. La integración del repositorio permite desplegar; la autorización del panel depende de Vercel y de la lista de administradores.
- **Google y medición:** cuenta `kuchitril.site@gmail.com`.

Las credenciales del cliente se mantienen fuera del repositorio. No registrar el proyecto de Supabase ni la titularidad de Vercel con una cuenta personal del desarrollador.

## Desarrollo local

```powershell
npm ci
npm run dev
```

La aplicación abre en `http://127.0.0.1:4321`. Usa `.env.example` como plantilla para un archivo `.env` local, ignorado por Git. No imprimir sus valores ni incluirlos en documentación, capturas, código de navegador o variables `PUBLIC_*`.

| Variable del servidor | Uso |
| --- | --- |
| `SUPABASE_URL` | URL HTTPS del proyecto del cliente. |
| `SUPABASE_PUBLISHABLE_KEY` | Cliente de Auth usado por el servidor. |
| `SUPABASE_SECRET_KEY` | Acceso privado a datos y Storage desde el servidor. |
| `ADMIN_EMAILS` | Correos administradores autorizados, separados por comas. Inicialmente `kuchitril.site@gmail.com`. |

El inicio de sesión admite el dominio oficial y los orígenes locales definidos en `src/lib/auth.ts`. Para probar OAuth local, autoriza explícitamente el callback local en Supabase. Las vistas previas de Vercel no obtienen acceso administrativo automáticamente.

## Supabase

1. Aplicar una vez `supabase/migrations/20261010170424_kuchitril_cms.sql` en el proyecto del cliente y conservar el registro de la migración.
2. Ejecutar `supabase/verify_cms.sql`: comprobar RLS, permisos, tres integrantes reales, una fila de ajustes y los buckets previstos.
3. Configurar el proveedor OIDC con identificador `vercel`, utilizando la aplicación Sign in with Vercel perteneciente al cliente. Sus credenciales permanecen en la configuración privada del proveedor.
4. Configurar la URL del sitio como `https://kuchitril.cl` y autorizar `https://kuchitril.cl/api/auth/vercel/callback` como destino de vuelta al sitio. La aplicación de Vercel utiliza el callback de Supabase que indica su configuración OIDC.
5. Mantener el proveedor de correo y contraseña desactivado y el proveedor de Vercel restringido al equipo Padi. El alta mediante OAuth permanece disponible para futuras cuentas autorizadas; cada una también debe estar en `ADMIN_EMAILS` antes de acceder a datos o administrar contenidos.

| Bucket | Acceso | Límite |
| --- | --- | --- |
| `cms-uploads` | Privado, staging de archivos por validar. | 50 MiB |
| `cms-images` | Público, imágenes autorizadas. | 10 MiB |
| `cms-videos` | Público, videos autorizados. | 50 MiB |

La migración prepara los buckets y sus tipos MIME. No añadir políticas de escritura pública. Al retirar un material de forma definitiva, comprobar referencias antes de eliminar su archivo y revisar también el staging pendiente. Los límites y la retención disponibles dependen del plan contratado; revisar consumo y las copias de seguridad en la cuenta del cliente.

## Despliegue en Vercel

1. Vincular el proyecto `kuchitril` del equipo Padi con `gprecabarren/kuchitril`, rama de producción `main`.
2. Elegir el preset **Astro**, Node.js **22**, instalación `npm ci` y compilación `npm run build`.
3. Mantener la salida que utiliza el adaptador `@astrojs/vercel` y Build Output API. No convertir el despliegue SSR en una publicación manual de archivos estáticos.
4. Configurar las cuatro variables de servidor en **Production**. Si se requieren en Preview, definirlas expresamente y conservar las restricciones de autenticación. Las variables locales no configuran Vercel.
5. Desplegar de nuevo después de cambiar variables de entorno; verificar que el dominio principal sea `kuchitril.cl` y que `www` redirija a él.
6. Verificar OAuth, lectura de la portada, CRUD y carga real de medios en producción con la cuenta autorizada.

`vercel.json` contiene la redirección histórica del portafolio a Behance y los encabezados de seguridad. La URL del botón del portafolio completo puede editarse desde el panel.

## Verificación

```powershell
npm run check
node scripts/test-cms.mjs
npm run build
```

`scripts/test-cms.mjs` realiza doce comprobaciones con datos ficticios de prueba y un servidor temporal, sin credenciales ni solicitudes de producción. Cubre autorización, origen de las mutaciones, cookies y PKCE, callback OAuth, validación de contenido, cargas de medios y bloqueo de API sin sesión.

Completar además una revisión real en escritorio y móvil:

- Entrar y salir con la cuenta de Vercel autorizada; comprobar que otra identidad no recibe acceso.
- Crear un borrador, editarlo, publicarlo, archivar y recuperar cada tipo de contenido.
- Recortar una foto con arrastre y con teclado; comprobar errores de formato y tamaño.
- Cargar y reproducir un video, comprobar progreso, portada, controles y posición debajo del gato en móvil.
- Revisar movimiento, navegación manual y pausa de testimonios; comprobar movimiento reducido.
- Guardar SEO y enlaces de Instagram; revisar HTML, metadatos y destinos reales.
- Comprobar que el nombre protegido no aparezca en el HTML padre, metadatos ni eventos de Analytics.

El éxito de las pruebas automatizadas no sustituye la revisión de los proveedores y del sitio desplegado.

## SEO y medición

`src/config/site.ts` centraliza dominio, contacto, verificación e identificadores públicos de Google. Los ajustes del CMS controlan título, descripción e imagen social del inicio. Cada página pública conserva canonical y metadatos; `public/sitemap.xml` excluye las rutas administrativas y nombres protegidos. Actualizar `lastmod` al cambiar contenido relevante.

- Search Console: propiedad de dominio `kuchitril.cl`, verificada por TXT en Vercel. Mantener el registro DNS.
- Casa matriz en **Concepción, Chile**. Santiago es zona de servicio; publicar una dirección cuando corresponda a una oficina real.
- Se solicitó indexación de la portada el 9 de octubre de 2026. El estado de indexación y del sitemap debe comprobarse en los informes de Google.
- Tag Manager: `GTM-NJL4JHHC`, cuenta `6381597466`, contenedor `266636143`.
- Analytics: cuenta `411379225`, propiedad `558191898`, flujo `16097204618`, medición `G-JTKCZRQXYR`.
- Consentimiento básico: las etiquetas solo se cargan tras aceptar analítica. Publicidad denegada; preferencias modificables en el pie de página. Revocar borra cookies accesibles y recarga.
- Preferencia local y cookie GA: 180 días. Retención de usuarios y eventos de GA: dos meses.
- `contact_whatsapp` mide un clic de intención. No se transmiten conversaciones ni datos personales de contactos.
- El nombre protegido del integrante de desarrollo aparece en un documento separado con `noindex` y `X-Robots-Tag`. No incluirlo en el HTML padre, texto alternativo, metadatos, sitemap ni eventos.

Revisar las políticas y el consentimiento al cambiar finalidades, proveedores o servicios de medición. El acceso administrativo utiliza cookies de sesión necesarias independientes de la aceptación de analítica.

## Material y datos pendientes

El cliente puede cargar desde el panel el video de July, retratos del equipo, trabajos autorizados y testimonios definitivos. Permanecen pendientes los textos finales de servicios, la cuenta de Instagram confirmada y el archivo Stapen con licencia web.

Para completar el aviso legal faltan titular o razón social, RUT, domicilio de contacto y responsable de solicitudes de privacidad. No inventar datos jurídicos ni sucursales. Las políticas públicas describen los servicios implementados y deben revisarse cuando cambie su uso.
