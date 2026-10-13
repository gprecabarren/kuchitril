// Exercise the traced Vercel function outside the repository's node_modules.
// Run after astro build: node scripts/check-built-runtime.mjs
import assert from 'node:assert/strict';
import { chmod, cp, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const prefix = 'kuchitril-runtime-check-';
const temporaryRoot = await realpath(tmpdir());
const directory = await mkdtemp(join(temporaryRoot, prefix));
const functionDirectory = join(directory, 'render.func');
const originalFetch = globalThis.fetch;
const envNames = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'ADMIN_EMAILS'];
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
let externalRequests = 0;

function assertTemporaryTarget(path) {
  const target = resolve(path);
  assert.ok(isAbsolute(target), 'Cleanup target must be absolute.');
  assert.equal(dirname(target), resolve(temporaryRoot), 'Cleanup target must be a direct child of the OS temporary directory.');
  assert.ok(basename(target).startsWith(prefix), 'Cleanup target must use the unique runtime-check prefix.');
  assert.notEqual(target, resolve(temporaryRoot), 'Never remove the temporary directory itself.');
  return target;
}

try {
  assertTemporaryTarget(directory);
  await chmod(directory, 0o700);
  await cp(resolve('.vercel/output/functions/_render.func'), functionDirectory, { recursive: true, dereference: true });
  const configuration = JSON.parse(await readFile(join(functionDirectory, '.vc-config.json'), 'utf8'));
  assert.equal(typeof configuration.handler, 'string', 'The Vercel function must declare its entry module.');
  const entry = resolve(functionDirectory, configuration.handler);
  const entryRelative = relative(functionDirectory, entry);
  assert.ok(entryRelative && !entryRelative.startsWith('..') && !isAbsolute(entryRelative), 'The handler must stay inside the copied function.');

  // Empty sessions should need no backend; prevent accidental external traffic.
  process.env.SUPABASE_URL = 'https://fixtureproject.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_runtime_check_fixture';
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.ADMIN_EMAILS = 'fixture@example.invalid';
  globalThis.fetch = async () => {
    externalRequests += 1;
    throw new Error('The isolated runtime check does not permit network requests.');
  };

  const { default: handler } = await import(pathToFileURL(entry).href);
  assert.equal(typeof handler?.fetch, 'function', 'The traced function must expose a fetch handler.');

  const admin = await handler.fetch(new Request('https://kuchitril.cl/admin/'));
  assert.equal(admin.status, 200, 'The administration login page must render.');
  const html = await admin.text();
  assert.match(html, /Continuar con Vercel/, 'The unauthenticated administration page must show the login.');
  assert.match(html, /href="\/api\/auth\/vercel\/login"/, 'The login must link to the configured Vercel flow.');

  const content = await handler.fetch(new Request('https://kuchitril.cl/api/admin/content/works'));
  assert.equal(content.status, 401, 'An unauthenticated CMS request must be denied.');
  assert.match(content.headers.get('cache-control') || '', /no-store/, 'CMS responses must not be cached.');
  assert.match(content.headers.get('x-robots-tag') || '', /noindex/, 'CMS responses must not be indexed.');
  assert.equal(typeof (await content.json()).error, 'string', 'The denied request must return a readable JSON error.');
  assert.equal(externalRequests, 0, 'These unauthenticated routes must not request an external service.');
  console.log('Built Vercel runtime passed: isolated module import, admin login 200, CMS authorization 401, no external requests.');
} finally {
  globalThis.fetch = originalFetch;
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  // Verify the absolute generated target immediately before recursive removal.
  await rm(assertTemporaryTarget(directory), { recursive: true, force: true });
}
