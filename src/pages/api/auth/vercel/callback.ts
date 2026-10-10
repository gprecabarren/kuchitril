import type { APIRoute } from 'astro';
import { createAuthClient, getAdminUser, authOrigin } from '../../../../lib/auth';

export const GET: APIRoute = async (context) => {
  try {
    authOrigin(context);
    const code = context.url.searchParams.get('code');
    if (!code || code.length > 4096 || context.url.searchParams.has('error')) return context.redirect('/admin/?error=acceso');
    const flowId = context.url.searchParams.get('sb_flow_id');
    if (flowId !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(flowId)) return context.redirect('/admin/?error=acceso');
    const client = createAuthClient(context);
    const { error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) return context.redirect('/admin/?error=acceso');
    // Reuse the client holding the freshly exchanged session on the first login.
    if (!await getAdminUser(context, client)) {
      await client.auth.signOut();
      return context.redirect('/admin/?error=autorizacion');
    }
    return context.redirect('/admin/');
  } catch { return context.redirect('/admin/?error=acceso'); }
};
