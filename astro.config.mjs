import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://kuchitril.cl',
  output: 'server',
  adapter: vercel(),
  security: { checkOrigin: true },
  vite: { optimizeDeps: { include: ['gsap', 'gsap/ScrollTrigger', 'tus-js-client'] } },
});
