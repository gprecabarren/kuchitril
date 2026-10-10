import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (/^\/(admin|api|equipo)(\/|$)/.test(context.url.pathname)) {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, nosnippet');
    response.headers.set('Referrer-Policy', 'no-referrer');
  }
  if (/^\/(admin|api)(\/|$)/.test(context.url.pathname)) response.headers.set('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  return response;
});
