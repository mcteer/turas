import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import nextEnvironment from '@next/env';

// Test-only supervisor, restricted to loopback test databases.
if (process.env.CI !== 'true' || process.env.TURAS_UI_PRODUCTION !== '1') throw Error('Explicit local production UI test scope required');
// Next loads production dotenv files too. Validate that same effective
// environment before starting any service, rather than only the parent shell.
process.env.NODE_ENV = 'production';
let environmentFailed = false;
nextEnvironment.loadEnvConfig(process.cwd(), false, { info() {}, error() { environmentFailed = true; } });
if (environmentFailed) throw Error('Local production UI environment could not be loaded');
if (!/^(?:ci-|test-)/.test(process.env.TURAS_ENVIRONMENT_ID ?? '')) throw Error('Explicit test environment marker required');
if (process.env.EVE_NEXT_PRODUCTION_ORIGIN) throw Error('Owned built-in native routing required');
const local = new Set(['localhost', '127.0.0.1', '[::1]']);
function scopedUrl(value, message) { try { return new URL(value ?? ''); } catch { throw Error(message); } }
const origin = scopedUrl(process.env.TURAS_APP_ORIGIN, 'Loopback UI origin required');
if (origin.protocol !== 'http:' || !local.has(origin.hostname) || origin.href !== origin.origin + '/') throw Error('Loopback UI origin required');
for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
  const database = scopedUrl(process.env[key], 'Owned local UI database required');
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !local.has(database.hostname) || !/^\/turas_(?:ci|test(?:_[a-z0-9_]+)?)$/.test(database.pathname)) throw Error('Owned local UI database required');
}
if (['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'CONTEXT_API_KEY', 'CONTEXT_DEV_API_KEY', 'RESEND_API_KEY'].some(key => process.env[key])) throw Error('Unpaid UI environment required');
if ((process.env.TURAS_JOB_EXECUTOR ?? 'local') !== 'local' || (process.env.TURAS_PRIVATE_OBJECT_BACKEND ?? 'local') !== 'local') throw Error('Local UI backends required');
if (!existsSync('.next/BUILD_ID') || !existsSync('.output/server/index.mjs')) throw Error('Build the current Next and Eve application before UI checks');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (process.env.TURAS_CODE_VERSION && process.env.TURAS_CODE_VERSION !== commit) throw Error('Current UI code identity required');
const env = { ...process.env, NODE_ENV: 'production', TURAS_CODE_VERSION: commit, TURAS_EVE_INTERNAL_ORIGIN: origin.origin + '/' };
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
function start(args, extraEnv = {}, piped = false) {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), env: { ...env, ...extraEnv }, stdio: piped ? ['inherit', 'pipe', 'pipe'] : 'inherit' });children.add(child);
  child.once('error', () => stop(1));
  child.once('exit', code => { children.delete(child);if (!stopping) stop(code || 1); });
  return child;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
// withEve owns the built service when next start runs. Starting another native
// server here would race the integration for the exact same production port.
const nativePort = Number(process.env.EVE_NEXT_PRODUCTION_PORT ?? '4274');
if (!Number.isInteger(nativePort) || nativePort < 1024 || nativePort > 65535 || nativePort === Number(origin.port || '80')) throw Error('Distinct prepared native UI port required');
env.EVE_NEXT_PRODUCTION_PORT=String(nativePort);
env.TURAS_EVE_INTERNAL_ORIGIN='http://127.0.0.1:'+nativePort+'/';
start([resolve('node_modules/next/dist/bin/next'), 'start', '--port', origin.port || '80']);
async function workers() {
  const deadline = Date.now() + 60000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(origin.origin + '/api/auth/session', { redirect: 'error', signal: AbortSignal.timeout(1500) });
      await response.body?.cancel();
      if (response.status === 401) {
        for (const file of ['maintenance-worker.ts', 'artifact-worker.ts', 'reports-worker.ts']) start(['--import', 'tsx', 'scripts/' + file]);
        return;
      }
    } catch { /* The owned application is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!stopping) stop(1);
}
void workers().catch(() => stop(1));
