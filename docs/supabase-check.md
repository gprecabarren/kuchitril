# Comprobación mínima de Supabase

## Estado: activo y probado

Auditoría del 29 de octubre de 2026: el repositorio `gprecabarren/kuchitril` es público y su rama predeterminada es `main`. No existían workflows de Actions, crons en `vercel.json` ni extensión `pg_cron` instalada en Supabase. No se duplicó ninguna tarea.

Las cinco tablas del CMS (`works`, `team_members`, `testimonials`, `site_settings`, `cms_media`) conservan RLS activo y sus permisos originales: acceso desde el servidor. La prueba inicial fue rechazada con HTTP 401 y se dejó el flujo desactivado. El usuario autorizó después la excepción mínima necesaria.

Se creó únicamente `public.health_check`, una tabla aislada con una columna `id smallint`, clave primaria y restricción `id = 1`. Contiene una única fila `id=1` sin nombres, contenidos ni datos personales. RLS está activo y la única política autoriza SELECT a `anon` cuando `id=1`. El único grant público es `SELECT(id)` para `anon`; no hay escritura ni acceso para `authenticated`. No se añadieron funciones, vistas, secuencias ni acceso a tablas del sitio. **No añadir datos del negocio a esta tabla.**

Migración aplicada en el proyecto del cliente desde el SQL Editor y guardada en `supabase/migrations/20261029072121_public_health_check.sql`. El cambio se ejecutó en una transacción con límites de bloqueo y ejecución. No fue necesario cambiar credenciales ni usar claves administrativas en Actions.

### Prueba real correcta

[Ejecución manual #2, 29 de octubre de 2026](https://github.com/gprecabarren/kuchitril/actions/runs/40835146595), commit `13b4619`:

- `database`: **success**, validó exactamente `health_check.id=1` mediante la clave publicable.
- `renew`: **success**, GitHub aceptó la renovación y GET confirmó **active**.
- Estado final del workflow: **active**. Ambos trabajos se ejecutaron en Ubuntu estándar del repositorio público.
- Verificación adicional: `health_check?id=eq.2` devuelve `[]` y se rechaza como resultado válido; `site_settings?id=eq.1` sigue devolviendo 401. La auditoría SQL confirma que las cinco tablas del CMS conservan sus restricciones y que la tabla de comprobación no admite escrituras públicas.
- Se volvió a ejecutar el Security Advisor tras el cambio: sin errores detectados.

### Historial de diagnóstico

[Ejecución manual #1, 29 de octubre de 2026](https://github.com/gprecabarren/kuchitril/actions/runs/40834455195), commit `afd5e18fc0545d347f2a824a972afd8fd12c5933`, duración total 14 segundos:

- `database`: falló en cinco segundos con HTTP **401**, salida curl **22**. No devolvió un identificador autorizado; no se declaró éxito.
- `renew`: terminó correctamente en tres segundos pese al fallo independiente de la consulta. GitHub aceptó PUT `/enable` y la comprobación GET devolvió **active**.
- Tras finalizar ambos trabajos, se desactivó mediante PUT `/disable` (**204**); GET confirmó **disabled_manually**. No se dejaron ejecuciones periódicas destinadas a fallar.
- Ambas variables quedaron configuradas en Actions, sin claves secretas ni administrativas. El repositorio siguió público y se usaron runners Ubuntu estándar gratuitos.

El bloqueo anterior quedó resuelto exclusivamente con la tabla aislada descrita arriba; no se abrió la lectura del CMS.

## Programación y consulta

Archivo: `.github/workflows/supabase-check.yml`.

- Lunes, miércoles y viernes a las **04:17 America/Santiago**, con ajustes estacionales a cargo de GitHub: `cron: '17 4 * * 1,3,5'` y `timezone: America/Santiago`.
- Intervalos de dos, dos y tres días. También admite `workflow_dispatch`; no escucha push ni pull_request.
- Consulta actual: `GET https://xempniqtispcggogngzc.supabase.co/rest/v1/health_check?select=id&id=eq.1&limit=1`.
- `health_check.id=1` es el identificador fijo de comprobación; la consulta está sujeta a grants y RLS, sin bypass.
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

Las ejecuciones no hacen escrituras en Supabase, commits periódicos, despliegues, peticiones al sitio ni actividad artificial en archivos. La única inserción fue la fila no sensible creada durante la migración inicial. Los cambios de implementación se publicaron en Git; el monitor no realiza despliegues ni depende de Vercel.

## Ejecutar, desactivar y recuperar

1. Abrir GitHub → Actions → **Supabase minimal check**.
2. Usar **Run workflow**, rama `main`. Si está desactivado, habilitarlo primero con **Enable workflow**.
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
