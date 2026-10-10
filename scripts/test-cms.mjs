// Focused security verification. Uses fixtures and an ephemeral local server only.
// Run: node scripts/test-cms.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = await mkdtemp(join(tmpdir(), 'kuchitril-cms-check-'));
const files = [];
const nativeFetch = globalThis.fetch;
const names = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'ADMIN_EMAILS'];
const originalEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
let server;
let checks = 0;

async function moduleFrom(source, mockDatabase = false) {
  const target = join(directory, `module-${files.length}.mjs`);
  // Bundling dependencies lets a temporary directory resolve packages reliably.
  const plugins = mockDatabase ? [{ name: 'fixture-database', setup(bundler) {
    bundler.onResolve({ filter: /(?:^|\/)supabase$/ }, () => ({ path: 'fixture-database', namespace: 'fixture' }));
    bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const getSupabaseAdmin = () => globalThis[Symbol.for('kuchitril-test-db')];
      export const getSupabaseUrl = () => 'https://fixtureproject.supabase.co';
      export const MEDIA_BUCKETS = {images:'cms-images',videos:'cms-videos',staging:'cms-uploads'};
      export const MEDIA_LIMITS = {imageBytes:10485760,videoBytes:52428800};
    `, loader: 'js' }));
  } }] : [];
  await build({ entryPoints: [resolve(source)], outfile: target, bundle: true, platform: 'node', format: 'esm', plugins,
    define: { 'import.meta.env': '{"SSR":true,"DEV":false}' }, logLevel: 'silent' });
  files.push(target);
  return import(pathToFileURL(target).href);
}

async function check(label, run) {
  await run();
  checks += 1;
  console.log(`PASS: ${label}`);
}

function contextFor(url, options = {}) {
  const changes = [];
  const request = new Request(url, options);
  return {
    url: new URL(url), request, params: {},
    cookies: { set(name, value, flags) { changes.push({ name, value, flags }); } },
    redirect(path, status = 302) { return new Response(null, { status, headers: { Location: path } }); },
    changes,
  };
}

const fixtureUser = {
  id: '86043e41-2fbb-4980-bb5a-481716fb7f4c', aud: 'authenticated', role: 'authenticated',
  email: 'client@example.com', email_confirmed_at: '2026-10-10T00:00:00.000Z', created_at: '2026-10-10T00:00:00.000Z',
  app_metadata: { provider: 'custom:vercel', providers: ['custom:vercel'] }, user_metadata: {},
  identities: [{ id: 'fixture', identity_id: 'fixture', provider: 'custom:vercel', user_id: '86043e41-2fbb-4980-bb5a-481716fb7f4c', identity_data: {} }],
};
const base64 = (input) => Buffer.from(JSON.stringify(input)).toString('base64url');
const accessToken = `${base64({ alg: 'HS256', typ: 'JWT' })}.${base64({ sub: fixtureUser.id, aud: 'authenticated', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}.Zml4dHVyZQ`;

function fixtureDatabase(initialRows, storageOptions = {}) {
  const rows = structuredClone(initialRows);
  const events = [];
  return {
    rows, events,
    from(table) {
      const filters = [];
      let mutation;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        update(data) { mutation = data; return query; },
        async maybeSingle() {
          const row = (rows[table] || []).find((row) => filters.every(([key, value]) => row[key] === value));
          if (row && mutation) { Object.assign(row, mutation); events.push(['update', table, mutation]); }
          return { data: row || null, error: null };
        },
        then(resolve, reject) { return query.maybeSingle().then(resolve, reject); },
      };
      return query;
    },
    storage: { from(bucket) { return {
      async info(path) { events.push(['info', bucket, path]); return { data: { size: storageOptions.size || 3, contentType: storageOptions.mime || 'image/jpeg' }, error: null }; },
      async createSignedUrl() { return { data: { signedUrl: 'https://fixtureproject.supabase.co/storage/v1/object/sign/cms-uploads/fixture?token=fixture' }, error: null }; },
      async copy(path, target, options) { events.push(['copy', bucket, path, target, options]); return { error: null }; },
      async remove(paths) { events.push(['remove', bucket, paths]); return { error: null }; },
      getPublicUrl(path) { return { data: { publicUrl: `https://fixtureproject.supabase.co/storage/v1/object/public/${bucket}/${path}` } }; },
    }; } },
  };
}

try {
  process.env.SUPABASE_URL = 'https://fixtureproject.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_security_fixture';
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.ADMIN_EMAILS = 'client@example.com';
  const auth = await moduleFrom('src/lib/auth.ts');
  const validation = await moduleFrom('src/lib/cms-validation.ts');
  const callback = await moduleFrom('src/pages/api/auth/vercel/callback.ts');

  await check('administrator requires confirmed allowlisted email and Vercel identity', async () => {
    const context = contextFor('https://kuchitril.cl/admin/');
    const clientFor = (user) => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } });
    assert.equal((await auth.getAdminUser(context, clientFor(fixtureUser)))?.id, fixtureUser.id);
    for (const user of [null, { ...fixtureUser, email_confirmed_at: null }, { ...fixtureUser, email: 'other@example.com' },
      { ...fixtureUser, identities: [{ provider: 'email' }], user_metadata: { provider: 'custom:vercel', admin: true } }]) {
      assert.equal(await auth.getAdminUser(context, clientFor(user)), null);
    }
  });

  await check('cross-origin mutations fail even before authentication', () => {
    const same = new Request('https://kuchitril.cl/api/admin/media/', { method: 'POST', headers: { Origin: 'https://kuchitril.cl', 'Sec-Fetch-Site': 'same-origin' } });
    assert.equal(auth.sameOrigin(same), true);
    for (const headers of [{}, { Origin: 'https://evil.example' }, { Origin: 'https://kuchitril.cl', 'Sec-Fetch-Site': 'cross-site' }]) {
      assert.equal(auth.sameOrigin(new Request(same.url, { method: 'POST', headers })), false);
    }
  });

  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url || String(input));
    assert.equal(url.origin, process.env.SUPABASE_URL, 'No external verification requests are allowed.');
    if (url.pathname === '/auth/v1/user') return Response.json(fixtureUser);
    if (url.pathname === '/auth/v1/token') return Response.json({ access_token: accessToken, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user: fixtureUser });
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    throw new Error('Unexpected fixture request');
  };

  let verifierCookie, verifierCookies;
  await check('PKCE verifier expires in ten minutes and uses secure HttpOnly cookies', async () => {
    const context = contextFor('https://kuchitril.cl/api/auth/vercel/login');
    const client = auth.createAuthClient(context);
    const { error } = await client.auth.signInWithOAuth({ provider: 'custom:vercel', options: { skipBrowserRedirect: true, redirectTo: 'https://kuchitril.cl/api/auth/vercel/callback' } });
    assert.equal(error, null);
    verifierCookie = context.changes.find((cookie) => cookie.name.includes('-code-verifier') && cookie.value);
    verifierCookies = [...new Map(context.changes.filter((cookie) => cookie.value).map((cookie) => [cookie.name, cookie.value]))];
    assert.ok(verifierCookie);
    assert.equal(verifierCookie.flags.maxAge, 600);
    assert.equal(verifierCookie.flags.httpOnly, true);
    assert.equal(verifierCookie.flags.secure, true);
    assert.equal(verifierCookie.flags.sameSite, 'lax');
  });

  let sessionCookieHeader;
  await check('new auth clients see cookies written during the same request; logout clears them', async () => {
    const context = contextFor('https://kuchitril.cl/admin/');
    const client = auth.createAuthClient(context);
    const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: 'fixture-refresh' });
    assert.equal(error, null);
    const session = context.changes.find((cookie) => cookie.name.includes('-auth-token') && !cookie.name.includes('-code-verifier') && cookie.value);
    assert.ok(session);
    assert.equal(session.flags.maxAge, 604800);
    sessionCookieHeader = [...new Map(context.changes.filter((cookie) => cookie.value).map((cookie) => [cookie.name, cookie.value]))]
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
    assert.ok(await auth.getAdminUser(context));
    await client.auth.signOut();
    assert.ok(context.changes.some((cookie) => cookie.name === session.name && cookie.flags.maxAge === 0));
    assert.equal(await auth.getAdminUser(context), null);
  });

  await check('first OAuth callback accepts its freshly exchanged session', async () => {
    const cookieHeader = verifierCookies.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
    const context = contextFor('https://kuchitril.cl/api/auth/vercel/callback?code=fixture-code', { headers: { Cookie: cookieHeader } });
    const response = await callback.GET(context);
    assert.equal(response.headers.get('Location'), '/admin/');
    assert.ok(context.changes.some((cookie) => cookie.name.includes('-auth-token') && cookie.value));
  });

  await check('strict content validation rejects extra fields, unsafe media, and inaccessible colors', () => {
    const testimonial = { quote: 'Una experiencia real.', name: 'Cliente', company: '', photo_url: '', background_color: '#ffffff', text_color: '#173e35', published: false, sort_order: 0 };
    assert.equal(validation.validateContent('testimonials', testimonial, false).name, 'Cliente');
    assert.throws(() => validation.validateContent('testimonials', { ...testimonial, updated_by: 'forged' }, false));
    assert.throws(() => validation.validateContent('testimonials', { ...testimonial, photo_url: '/assets/malicious.svg' }, false));
    assert.throws(() => validation.validateContent('testimonials', { ...testimonial, text_color: '#ffffff' }, false));
    const team = { name: 'Genaro Piedra Recabarren', role: 'Desarrollo web', photo_url: '', photo_alt: '', exclude_name_from_index: false, published: true, sort_order: 0 };
    assert.equal(validation.validateContent('team', team, false).exclude_name_from_index, true);
  });

  await check('JSON byte limit applies even without a Content-Length header', async () => {
    assert.deepEqual(await validation.smallJson(new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ok":true}' })), { ok: true });
    await assert.rejects(validation.smallJson(new Request('http://localhost/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(32768) }) })));
  });

  const securedPatch = await moduleFrom('src/pages/api/admin/content/[kind]/[id].ts', true);
  const securedComplete = await moduleFrom('src/pages/api/admin/media/[id]/complete.ts', true);
  const protectedContext = (path, body) => contextFor('https://kuchitril.cl' + path, {
    method: body ? 'PATCH' : 'POST', headers: { Origin: 'https://kuchitril.cl', Cookie: sessionCookieHeader, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  await check('single-color PATCH validates the complete resulting testimonial before saving', async () => {
    const row = { id: fixtureUser.id, quote: 'Una experiencia real.', name: 'Cliente', company: '', photo_url: '', background_color: '#ffffff', text_color: '#173e35', published: false, sort_order: 0, deleted_at: null };
    const db = fixtureDatabase({ testimonials: [row] });
    globalThis[Symbol.for('kuchitril-test-db')] = db;
    const context = protectedContext(`/api/admin/content/testimonials/${row.id}`, { text_color: '#ffffff' });
    context.params = { kind: 'testimonials', id: row.id };
    const response = await securedPatch.PATCH(context);
    assert.equal(response.status, 400);
    assert.equal(db.rows.testimonials[0].text_color, '#173e35');
    assert.equal(db.events.length, 0);
  });

  await check('an administrator cannot finalize another administrator’s staged file', async () => {
    const row = { id: fixtureUser.id, created_by: 'other-administrator', status: 'pending' };
    const db = fixtureDatabase({ cms_media: [row] });
    globalThis[Symbol.for('kuchitril-test-db')] = db;
    const context = protectedContext(`/api/admin/media/${row.id}/complete`); context.params.id = row.id;
    const response = await securedComplete.POST(context);
    assert.equal(response.status, 404);
    assert.equal(db.events.length, 0);
  });

  await check('HTML masquerading as JPEG is rejected and its private upload is removed', async () => {
    const row = { id: fixtureUser.id, created_by: fixtureUser.id, status: 'pending', bucket: 'cms-images', staging_path: `${fixtureUser.id}/fixture.jpg`, mime_type: 'image/jpeg', size_bytes: 3 };
    const db = fixtureDatabase({ cms_media: [row] });
    globalThis[Symbol.for('kuchitril-test-db')] = db;
    const userFetch = globalThis.fetch;
    globalThis.fetch = async (input, options) => String(input).includes('/storage/v1/') ? new Response(new TextEncoder().encode('<html>'), { status: 206 }) : userFetch(input, options);
    try {
      const context = protectedContext(`/api/admin/media/${row.id}/complete`); context.params.id = row.id;
      const response = await securedComplete.POST(context);
      assert.equal(response.status, 400);
      assert.equal(db.rows.cms_media[0].status, 'rejected');
      assert.ok(db.events.some(([event, bucket]) => event === 'remove' && bucket === 'cms-uploads'));
      assert.equal(db.events.some(([event]) => event === 'copy'), false);
    } finally { globalThis.fetch = userFetch; }
  });

  await check('valid upload header is promoted once and a repeated completion is idempotent', async () => {
    const row = { id: fixtureUser.id, created_by: fixtureUser.id, status: 'pending', bucket: 'cms-images', staging_path: `${fixtureUser.id}/fixture.jpg`, mime_type: 'image/jpeg', size_bytes: 3 };
    const db = fixtureDatabase({ cms_media: [row] });
    globalThis[Symbol.for('kuchitril-test-db')] = db;
    const userFetch = globalThis.fetch;
    globalThis.fetch = async (input, options) => String(input).includes('/storage/v1/') ? new Response(new Uint8Array([255, 216, 255]), { status: 206 }) : userFetch(input, options);
    try {
      for (let index = 0; index < 2; index++) {
        const context = protectedContext(`/api/admin/media/${row.id}/complete`); context.params.id = row.id;
        const response = await securedComplete.POST(context);
        assert.equal(response.status, 200);
        assert.match((await response.json()).publicUrl, /\/object\/public\/cms-images\//);
      }
      assert.equal(db.rows.cms_media[0].status, 'ready');
      assert.equal(db.events.filter(([event]) => event === 'copy').length, 1);
    } finally { globalThis.fetch = userFetch; }
  });

  const contentIndex = await moduleFrom('src/pages/api/admin/content/[kind]/index.ts');
  const contentItem = await moduleFrom('src/pages/api/admin/content/[kind]/[id].ts');
  const mediaIndex = await moduleFrom('src/pages/api/admin/media/index.ts');
  const mediaComplete = await moduleFrom('src/pages/api/admin/media/[id]/complete.ts');
  globalThis.fetch = async () => { throw new Error('Unauthenticated routes must not contact external services.'); };

  server = createServer(async (request, response) => {
    try {
      const url = `http://127.0.0.1:${server.address().port}${request.url}`;
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const method = request.method;
      const context = contextFor(url, { method, headers: request.headers, ...(method === 'GET' ? {} : { body: Buffer.concat(chunks) }) });
      const path = new URL(url).pathname;
      let route;
      if (path === '/api/admin/media/') route = mediaIndex;
      else if (path.endsWith('/complete')) { route = mediaComplete; context.params.id = fixtureUser.id; }
      else if (path.endsWith(fixtureUser.id)) { route = contentItem; context.params = { kind: 'works', id: fixtureUser.id }; }
      else { route = contentIndex; context.params.kind = 'works'; }
      const result = await route[method](context);
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(await result.text());
    } catch { response.writeHead(500); response.end('Fixture route failure'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  await check('real HTTP requests cannot read, write, archive, or authorize uploads without a session', async () => {
    for (const [method, path] of [['GET', '/api/admin/content/works/'], ['POST', '/api/admin/content/works/'], ['PATCH', `/api/admin/content/works/${fixtureUser.id}`], ['DELETE', `/api/admin/content/works/${fixtureUser.id}`], ['POST', '/api/admin/media/'], ['POST', `/api/admin/media/${fixtureUser.id}/complete`]]) {
      const response = await nativeFetch(origin + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: '{}' }) });
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.match(response.headers.get('Cache-Control'), /no-store/);
      assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
    }
    const crossOrigin = await nativeFetch(origin + '/api/admin/media/', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(crossOrigin.status, 403);
  });

  console.log(`Completed ${checks} focused CMS security checks; no production requests or credentials used.`);
} finally {
  globalThis.fetch = nativeFetch;
  delete globalThis[Symbol.for('kuchitril-test-db')];
  for (const name of names) {
    if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name];
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const file of files) await unlink(file).catch(() => {});
  await rmdir(directory).catch(() => {});
}
