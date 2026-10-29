# Comprobación mínima de Supabase

## Estado: bloqueada por permisos públicos existentes

Auditoría del 29 de octubre de 2026: el repositorio `gprecabarren/kuchitril` es público y su rama predeterminada es `main`. No existían workflows de Actions, crons en `vercel.json` ni extensión `pg_cron` instalada en Supabase. No se duplicó ninguna tarea.

Las cinco tablas de `public` (`works`, `team_members`, `testimonials`, `site_settings`, `cms_media`) tienen RLS activo, cero políticas y no conceden SELECT a `anon`. Es la arquitectura intencional del CMS: acceso desde el servidor. La Data API rechazó la prueba con `sb_publishable_…`: HTTP 401, código PostgreSQL `42501`, permiso denegado. No se han modificado grants, políticas ni registros.

El workflow está implementado para probar ambos trabajos reales, pero debe permanecer **desactivado** mientras no exista una fila con lectura pública previamente autorizada. No hay una consulta que pueda cumplir simultáneamente la lectura pública exigida y la prohibición de ampliar permisos. No considerar esta implementación un monitor operativo hasta resolver ese requisito y completar ambos trabajos correctamente.

## Programación y consulta

Archivo: `.github/workflows/supabase-check.yml`.

- Lunes, miércoles y viernes a las **04:17 America/Santiago**, con ajustes estacionales a cargo de GitHub: `cron: '17 4 * * 1,3,5'` y `timezone: America/Santiago`.
- Intervalos de dos, dos y tres días. También admite `workflow_dispatch`; no escucha push ni pull_request.
- Consulta de diagnóstico actual: `GET https://xempniqtispcggogngzc.supabase.co/rest/v1/site_settings?select=id&id=eq.1&limit=1`.
- `site_settings.id=1` es la fila singleton del CMS, pero **no tiene acceso público autorizado**. La consulta está deliberadamente sujeta a los permisos vigentes y falla; no es un bypass.
- Solo se solicita `id`, por clave primaria y con `limit=1`. No se consultan contenidos, nombres, fotos ni páginas del sitio.
- Debe devolver exactamente `[{"id":1}]`; JSON inválido, vacío o un identificador diferente hacen fallar el trabajo.

## Variables y permisos separados

En Settings → Secrets and variables → Actions → Variables del repositorio:

- `SUPABASE_URL`: URL HTTPS exacta del proyecto.
- `SUPABASE_PUBLISHABLE_KEY`: clave pública existente; únicamente se acepta el prefijo `sb_publishable_` y caracteres de token válidos. No copiar claves administrativas, secretas, service_role, JWT antiguos ni contraseñas.

No se guardan valores de claves en el repositorio ni se imprimen en logs. Las variables de Actions no son secretos y sus valores pueden ser accesibles a quienes tengan acceso al repositorio; por ello solo se admite una clave publicable.

`permissions: {}` por defecto. El trabajo `database` no tiene permisos del repositorio ni token explícito; recibe las dos variables solo en su paso. El trabajo independiente `renew` no depende del resultado de `database`, no recibe variables de Supabase y solo tiene `actions: write`, usando el token temporal `github.token`. No tiene `contents: write` ni modifica código.

El segundo trabajo llama a `PUT /repos/gprecabarren/kuchitril/actions/workflows/supabase-check.yml/enable` y luego GET al mismo workflow, verificando `state == active`. No usa tokens personales persistentes ni acciones de terceros.

## Carga, coste y límites

Ambos trabajos usan `ubuntu-latest` estándar, gratuito en este repositorio público. No se cambia visibilidad, no se contratan servicios ni se crean artefactos o cachés. No hay checkout, npm install ni dependencias externas: solo Bash, curl y jq incluidos en el runner.

Cada trabajo tiene un límite de dos minutos. La consulta normal es una petición diminuta, limitada además a 4096 bytes. curl exige HTTPS y TLS moderno, falla con errores HTTP, conexión máxima de 10 segundos, petición máxima de 20 segundos y como máximo dos reintentos con espera de dos segundos y ventana acotada. El archivo temporal se elimina al terminar. Los trabajos se ejecutan independientemente; su tiempo de cola no queda cubierto por el límite de ejecución.

No se hacen escrituras en Supabase, commits periódicos, despliegues, peticiones al sitio ni actividad artificial en archivos. El cambio del icono de WhatsApp se despliega una vez como parte de la modificación visual solicitada, ajena a las ejecuciones del monitor.

## Ejecutar, desactivar y recuperar

1. Abrir GitHub → Actions → **Supabase minimal check**.
2. Si está desactivado, **Enable workflow** y después **Run workflow**, rama `main`. Mientras continúe el bloqueo actual, la prueba de base de datos fallará y debe volver a desactivarse al terminar.
3. Revisar ambos trabajos: el primero debe validar el identificador y el segundo confirmar la renovación. Un HTTP 200 vacío no es éxito.
4. Para detenerlo, esperar que no queden ejecuciones pendientes o en curso (o cancelarlas) y usar **Disable workflow**. De lo contrario, una renovación aún en curso podría volver a activarlo.
5. Desde CLI autenticado: `gh workflow run supabase-check.yml --repo gprecabarren/kuchitril --ref main`; para desactivar: `gh workflow disable supabase-check.yml --repo gprecabarren/kuchitril`.

La renovación es preventiva: **no garantiza ejecuciones futuras** ni que GitHub reinicie el cómputo de inactividad. GitHub puede retrasar u omitir cron por carga, desactivar workflows públicos tras 60 días sin actividad, restringir tokens o suspender ejecuciones. Un flujo ya desactivado **no puede repararse a sí mismo**; requiere intervención externa. Tampoco garantiza disponibilidad ni evita con certeza la pausa de Supabase Free. No sustituye backups ni monitoreo con SLA.

## Documentación consultada

- [Programación, timezone e inactividad de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [API oficial para habilitar workflows](https://docs.github.com/en/rest/actions/workflows#enable-a-workflow)
- [Coste de runners públicos](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Claves y permisos de Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Cambio de cifrados TLS de Supabase](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
