import { evaluateComplianceAssurance } from '../src/compliance-assurance.js';

function configured(value) { return typeof value === 'string' && value.trim().length > 0 && !/replace-with|example\.com|example\/atlas/i.test(value); }
function microsoftTenant(value){const tenant=value||'organizations';return tenant==='organizations'||/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)||/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(tenant);}
function publicOrigin(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&(url.pathname==='/'||url.pathname==='');}catch{return false;}}

export function evaluateLaunchReadiness(env = process.env) {
  const checks = [];
  const missing = [];
  const requireValue = (name, label = name) => {
    const passed = configured(env[name]); checks.push({ name: label, passed }); if (!passed) missing.push(name);
  };
  requireValue('DATABASE_URL', 'PostgreSQL configured');
  requireValue('AUTH_TOKEN_SECRET', 'Authentication secret configured');
  requireValue('MFA_ENCRYPTION_KEY', 'MFA secret encryption configured');
  requireValue('AI_PROVIDER', 'Interchangeable AI provider selected');
  requireValue('AI_MODEL', 'AI model selected');
  if (env.AI_PROVIDER === 'openai') requireValue('OPENAI_API_KEY', 'OpenAI credential configured');
  const aiEncryption = configured(env.AI_CONTENT_ENCRYPTION_KEY) || configured(env.AI_CONTENT_ENCRYPTION_KEYS);
  checks.push({ name: 'AI content encryption configured', passed: aiEncryption }); if (!aiEncryption) missing.push('AI_CONTENT_ENCRYPTION_KEY');
  requireValue('CMS_CREDENTIAL_ENCRYPTION_KEY', 'External credential encryption configured');
  const durableDocuments=env.DOCUMENT_STORAGE_PROVIDER==='postgres'||env.DOCUMENT_STORAGE_PROVIDER==='filesystem'&&configured(env.DOCUMENT_STORAGE_PATH);
  checks.push({name:'Durable document storage configured',passed:durableDocuments});if(!durableDocuments)missing.push('DOCUMENT_STORAGE_PROVIDER');
  const malwareProtection=env.FILE_MALWARE_SCANNER==='clamav'&&configured(env.CLAMAV_HOST);
  checks.push({name:'Fail-closed malware scanning configured',passed:malwareProtection});if(!malwareProtection)missing.push('FILE_MALWARE_SCANNER=clamav and CLAMAV_HOST');
  const microsoft = configured(env.MICROSOFT_365_CLIENT_ID) && configured(env.MICROSOFT_365_CLIENT_SECRET);
  const google = configured(env.GOOGLE_WORKSPACE_CLIENT_ID) && configured(env.GOOGLE_WORKSPACE_CLIENT_SECRET);
  const liveMailCalendar=microsoft||google;
  checks.push({ name: 'Live email and calendar OAuth provider configured', passed: liveMailCalendar });
  if (!liveMailCalendar) missing.push('Microsoft 365 or Google Workspace OAuth credentials');
  const tenant=!microsoft||microsoftTenant(env.MICROSOFT_365_TENANT);
  checks.push({name:'Microsoft organizational tenant is valid when enabled',passed:tenant});if(!tenant)missing.push('MICROSOFT_365_TENANT');
  const syncEnabled = env.CMS_SYNC_ENABLED === 'true';
  checks.push({ name: 'Continuous external synchronization enabled', passed: syncEnabled }); if (!syncEnabled) missing.push('CMS_SYNC_ENABLED=true');
  const publicUrl=publicOrigin(env.PUBLIC_BASE_URL);
  checks.push({ name: 'Public HTTPS origin configured', passed: publicUrl }); if (!publicUrl) missing.push('PUBLIC_BASE_URL');
  checks.push({name:'Provider OAuth callback is fixed to the Atlas server',passed:publicUrl});if(!publicUrl)missing.push('OAuth callback: https://YOUR-HOST/v1/cms/oauth/callback');
  const proxyDecision = env.TRUST_PROXY === 'true' || env.TRUST_PROXY === 'false';
  checks.push({ name: 'Trusted proxy behavior explicitly configured', passed: proxyDecision }); if (!proxyDecision) missing.push('TRUST_PROXY=true or TRUST_PROXY=false');
  const tokenLength = String(env.AUTH_TOKEN_SECRET ?? '').length >= 32;
  checks.push({ name: 'Authentication secret meets minimum length', passed: tokenLength }); if (!tokenLength && configured(env.AUTH_TOKEN_SECRET)) missing.push('AUTH_TOKEN_SECRET (32+ characters)');
  const technicalReady = missing.length === 0;
  const assurance = evaluateComplianceAssurance(env, { technicalReady });
  if (assurance.enforced && !assurance.ready) {
    for (const name of assurance.missing) missing.push(name);
  }
  return { ready: technicalReady && assurance.ready, technicalReady, checks, missing: [...new Set(missing)], assurance };
}
