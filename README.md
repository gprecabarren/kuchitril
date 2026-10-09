# Kuchitril

Sitio estático de la agencia con Astro, TypeScript, GSAP y CSS. Tipografía general DM Sans; Bebas Neue provisional en el nombre de marca, hasta recibir Stapen con licencia web. Node.js 22 en producción.

## Desarrollo y verificación

```powershell
npm ci
npm run dev
npm run check
npm run build
```

Vercel compila la rama main del repositorio gprecabarren/kuchitril en el proyecto Kuchitril del equipo Padi (padi9). Framework Astro, instalación npm ci, build npm run build, salida dist, dominio canónico https://kuchitril.cl. No se requiere base de datos ni variables secretas.

## Contenido

- Intro del gato y animaciones al desplazarse. Respeta movimiento reducido.
- Agencia, biografía de Diego Padilla Dalia, equipo y cuatro servicios.
- Espacios explícitos para video, retratos en blanco y negro, cuatro trabajos y testimonios.
- Portafolio externo https://www.behance.net/pesadilla. La ruta anterior /portafolio/ redirige permanentemente a Behance.
- El panel de demostración fue retirado; /admin/ redirige al inicio.
- Contacto por WhatsApp. El nombre del integrante de desarrollo se muestra en un documento incrustado con noindex y X-Robots-Tag; no está en el HTML de la landing, los metadatos ni el sitemap.

## SEO y medición

src/config/site.ts centraliza dominio, contacto, verificación e identificadores públicos de Google. Cada página tiene título, descripción, canonical, etiquetas sociales y datos estructurados. public/sitemap.xml contiene solo las páginas vigentes. Actualizar lastmod al modificar su contenido.

- Search Console: propiedad de dominio kuchitril.cl, verificada por TXT de DNS en Vercel. Mantener el registro.
- Cuenta Google: kuchitril.site@gmail.com.
- Tag Manager: GTM-NJL4JHHC, cuenta 6381597466, contenedor 266636143.
- Analytics: cuenta 411379225, propiedad 558191898, flujo 16097204618, medición G-JTKCZRQXYR.
- Modo de consentimiento básico: las etiquetas no se cargan hasta aceptar analítica. Publicidad denegada. Preferencias modificables en el pie de página; revocar borra cookies accesibles y recarga.
- Preferencia local válida 180 días. Cookie GA configurada 180 días. Retención de usuarios/eventos de GA: dos meses.
- Evento contact_whatsapp: mide un clic de intención, no una conversación ni un cliente confirmado. No se transmiten datos de mensajes o contactos.
- No se deben agregar etiquetas publicitarias ni nuevos servicios de medición sin actualizar las políticas y el consentimiento.

## Material pendiente

Video de July, retratos del equipo, trabajos autorizados, testimonios finales, textos de servicios y archivo Stapen con licencia web. Confirmar identidad jurídica del responsable, RUT y dirección de contacto para completar el aviso legal; no inventar sucursales.

Las políticas describen los servicios implementados. Revisarlas al cambiar las finalidades, proveedores o normativa aplicable.
