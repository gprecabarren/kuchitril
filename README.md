# Kuchitril — primer prototipo

Landing y portafolio para la agencia Kuchitril. Usa Astro, TypeScript, CSS, GSAP y Manrope sobre Node.js 22. Los colores, el gato con bandera y la foto del fundador provienen del material entregado; las imágenes web están optimizadas en `public/assets/`.

## Ejecutar

```powershell
npm install
npm run dev
```

Abrir [http://127.0.0.1:4321/](http://127.0.0.1:4321/). El portafolio está en `/portafolio/` y el panel de prueba en `/admin/`.

## Qué incluye

- Intro animada del gato con bandera, animaciones al desplazarse y adaptación para pantallas pequeñas. La opción de movimiento reducido omite la intro y los efectos.
- Presentación de la agencia, fundador, cuatro servicios, portafolio, espacio para testimonios y contacto por WhatsApp.
- Panel de prueba para crear, editar, eliminar, ordenar y destacar hasta cinco proyectos. Los cambios se guardan en `localStorage`, únicamente en el navegador donde se hicieron. Se pueden restaurar los ejemplos desde el mismo panel.
- Los proyectos y testimonios iniciales están marcados como muestras; no representan marcas ni opiniones verificadas.

## Material pendiente y panel

Reemplazar proyectos, nombres de marcas y testimonios por material autorizado. Para que el panel funcione en varios dispositivos hay que conectar Supabase, habilitar autenticación, permisos y almacenamiento de imágenes. Hasta entonces, `/admin/` es solo un prototipo: los cambios se guardan en cada navegador y no afectan el sitio de otros visitantes.

## Verificación

```powershell
npm run check
npm run build
```

La compilación genera el sitio estático en `dist/`. En Vercel, configurar el framework Astro, Node.js 22.x, directorio raíz `./`, comando de instalación `npm ci`, comando de compilación `npm run build` y directorio de salida `dist`. La rama de producción es `main`.
