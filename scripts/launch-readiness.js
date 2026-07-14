function configured(value) { return typeof value === 'string' && value.trim().length > 0 && !/replace-with|example\.com|example\/atlas/i.test(value); }

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
  const google = configured(env.GOOGLE_WORKSPACE_CLIENT_ID) && configured(env.GOOGLE_WORKSPACE_CLIENT_SECRET);
  const microsoft = configured(env.MICROSOFT_365_CLIENT_ID) && configured(env.MICROSOFT_365_CLIENT_SECRET);
  checks.push({ name: 'At least one production mailbox provider configured', passed: google || microsoft });
  if (!google && !microsoft) missing.push('GOOGLE_WORKSPACE_* or MICROSOFT_365_*');
  const syncEnabled = env.CMS_SYNC_ENABLED === 'true';
  checks.push({ name: 'Continuous external synchronization enabled', passed: syncEnabled }); if (!syncEnabled) missing.push('CMS_SYNC_ENABLED=true');
  let publicUrl = false;
  try { publicUrl = new URL(env.PUBLIC_BASE_URL).protocol === 'https:'; } catch {}
  checks.push({ name: 'Public HTTPS origin configured', passed: publicUrl }); if (!publicUrl) missing.push('PUBLIC_BASE_URL');
  const tokenLength = String(env.AUTH_TOKEN_SECRET ?? '').length >= 32;
  checks.push({ name: 'Authentication secret meets minimum length', passed: tokenLength }); if (!tokenLength && configured(env.AUTH_TOKEN_SECRET)) missing.push('AUTH_TOKEN_SECRET (32+ characters)');
  return { ready: missing.length === 0, checks, missing: [...new Set(missing)] };
}
