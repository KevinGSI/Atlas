import { randomBytes } from 'node:crypto';

async function responseData(response, label) {
  let body;
  try { body = await response.json(); }
  catch { throw new Error(`${label} returned invalid JSON`); }
  if (!response.ok) throw new Error(`${label} failed with status ${response.status}: ${body.error?.code ?? 'UNKNOWN'}`);
  return body.data;
}
export async function runStagingSmoke(baseUrl, options = {}) {
  const base = String(baseUrl ?? '').replace(/\/$/, '');
  if (!base) throw new Error('STAGING_BASE_URL is required');
  const parsed = new URL(base);
  if (parsed.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error('STAGING_BASE_URL must use HTTPS outside localhost');
  const transport = options.transport ?? fetch;
  const suffix = (options.randomBytes ?? randomBytes)(8).toString('hex');
  const email = `atlas-smoke-${suffix}@example.invalid`;
  const password = options.password ?? `Atlas-smoke-${suffix}-secure-password`;
  const started = Date.now();
  const checks = [];

  const ready = await responseData(await transport(`${base}/ready`), 'readiness');
  if (ready.status !== 'ready') throw new Error('Atlas did not report ready');
  checks.push('ready');

  const page = await transport(`${base}/`);
  const html = await page.text();
  if (!page.ok || !html.includes('Atlas') || !html.includes('While You Were Gone')) throw new Error('Connected homepage smoke check failed');
  checks.push('homepage');

  const registered = await responseData(await transport(`${base}/v1/auth/register-firm`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ firmName: `Atlas Smoke ${suffix}`, name: 'Atlas Smoke Test', email, password })
  }), 'firm registration');
  if (!registered.accessToken || !registered.refreshToken || !registered.user?.id || !registered.workspace?.id || !registered.subscription?.status) throw new Error('Firm registration did not return the complete subscribed workspace');
  checks.push('firm-onboarding');

  const refreshed = await responseData(await transport(`${base}/v1/auth/refresh`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: registered.refreshToken })
  }), 'session rotation');
  if (!refreshed.accessToken || !refreshed.refreshToken || refreshed.refreshToken === registered.refreshToken) throw new Error('Session rotation did not return replacement credentials');
  checks.push('session-rotation');

  const workspaceId = registered.workspace.id;
  const auth = { authorization: `Bearer ${refreshed.accessToken}`, 'content-type': 'application/json' };
  const matter = await responseData(await transport(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/objects`, {
    method: 'POST', headers: auth, body: JSON.stringify({ dimension: 'matter', type: 'civil', title: `Synthetic launch verification ${suffix}`, state: { status: 'open', synthetic: true } })
  }), 'matter creation');
  const task = await responseData(await transport(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/objects`, {
    method: 'POST', headers: auth, body: JSON.stringify({ parentObjectId: matter.id, dimension: 'operation', type: 'task', title: 'Verify pilot readiness', state: { scope: 'matter', matterId: matter.id, status: 'open', synthetic: true } })
  }), 'task creation');
  if (!matter.id || task.parentObjectId !== matter.id) throw new Error('Canonical matter-scoped work was not created');
  checks.push('canonical-work');

  const providers = await responseData(await transport(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/cms/providers`, { headers: { authorization: auth.authorization } }), 'connector discovery');
  if (!Array.isArray(providers)) throw new Error('Connector discovery did not return a list');
  checks.push('connector-discovery');

  const feed = await responseData(await transport(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/home/while-you-were-gone`, { headers: { authorization: auth.authorization } }), 'awareness feed');
  if (!Array.isArray(feed)) throw new Error('Awareness feed did not return a list');
  checks.push('awareness');

  return { passed: true, checks, durationMs: Date.now() - started, version: ready.version ?? null, workspaceCreated: true };
}
