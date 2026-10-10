import type { APIRoute } from 'astro';
import { createAuthClient, sameOrigin, json } from '../../../lib/auth';

export const POST: APIRoute = async (context) => {
  if (!sameOrigin(context.request)) return json({ error: 'Solicitud no permitida.' }, 403);
  try {
    await createAuthClient(context).auth.signOut({ scope: 'global' });
    return context.redirect('/admin/', 303);
  } catch { return json({ error: 'No pudimos cerrar la sesión. Vuelve a intentarlo.' }, 503); }
};
