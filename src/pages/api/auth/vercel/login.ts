import type { APIRoute } from 'astro';
import { authOrigin, createAuthClient } from '../../../../lib/auth';

export const GET: APIRoute = async (context) => {
  try {
    const { data, error } = await createAuthClient(context).auth.signInWithOAuth({
      provider: 'custom:vercel',
      options: { redirectTo: authOrigin(context) + '/api/auth/vercel/callback', skipBrowserRedirect: true },
    });
    if (error || !data.url) return context.redirect('/admin/?error=conexion');
    return context.redirect(data.url);
  } catch { return context.redirect('/admin/?error=conexion'); }
};
