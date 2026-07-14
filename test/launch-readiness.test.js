import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLaunchReadiness } from '../scripts/launch-readiness.js';

const valid = {
  DATABASE_URL:'postgresql://atlas:secret@db.internal/atlas', AUTH_TOKEN_SECRET:'a'.repeat(48),MFA_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),
  AI_PROVIDER:'openai', AI_MODEL:'gpt-4.1-mini', OPENAI_API_KEY:'configured-api-key',
  AI_CONTENT_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'), CMS_CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,2).toString('base64'),
  MICROSOFT_365_CLIENT_ID:'microsoft-client-id', MICROSOFT_365_CLIENT_SECRET:'microsoft-client-secret', MICROSOFT_365_TENANT:'organizations',
  CMS_SYNC_ENABLED:'true', PUBLIC_BASE_URL:'https://atlas.example.test', TRUST_PROXY:'true', DOCUMENT_STORAGE_PROVIDER:'postgres', FILE_MALWARE_SCANNER:'clamav', CLAMAV_HOST:'clamav.internal'
};

test('launch readiness passes only a complete production pilot environment without exposing values',()=>{const result=evaluateLaunchReadiness(valid);assert.equal(result.ready,true);assert.ok(result.checks.every(item=>item.passed));const serialized=JSON.stringify(result);assert.equal(serialized.includes(valid.OPENAI_API_KEY),false);assert.equal(serialized.includes(valid.DATABASE_URL),false);});
test('launch readiness fails closed without any live mail provider and with an insecure public origin',()=>{const result=evaluateLaunchReadiness({...valid,MICROSOFT_365_CLIENT_ID:'',MICROSOFT_365_CLIENT_SECRET:'',CMS_SYNC_ENABLED:'false',PUBLIC_BASE_URL:'http://atlas.example.test'});assert.equal(result.ready,false);assert.ok(result.missing.includes('Microsoft 365 or Google Workspace OAuth credentials'));assert.ok(result.missing.includes('CMS_SYNC_ENABLED=true'));assert.ok(result.missing.includes('PUBLIC_BASE_URL'));});
test('launch readiness rejects consumer Microsoft tenants and public URLs with callback-changing paths',()=>{const result=evaluateLaunchReadiness({...valid,MICROSOFT_365_TENANT:'common',PUBLIC_BASE_URL:'https://atlas.example.test/subpath'});assert.equal(result.ready,false);assert.ok(result.missing.includes('MICROSOFT_365_TENANT'));assert.ok(result.missing.includes('PUBLIC_BASE_URL'));assert.ok(result.checks.some(item=>item.name==='Provider OAuth callback is fixed to the Atlas server'&&!item.passed));});
test('Google Workspace alone satisfies the provider-neutral live email and calendar requirement',()=>{const result=evaluateLaunchReadiness({...valid,MICROSOFT_365_CLIENT_ID:'',MICROSOFT_365_CLIENT_SECRET:'',GOOGLE_WORKSPACE_CLIENT_ID:'google-client-id',GOOGLE_WORKSPACE_CLIENT_SECRET:'google-client-secret'});assert.equal(result.ready,true);assert.ok(result.checks.some(item=>item.name==='Live email and calendar OAuth provider configured'&&item.passed));});
test('launch readiness refuses ephemeral document storage',()=>{const result=evaluateLaunchReadiness({...valid,DOCUMENT_STORAGE_PROVIDER:'memory'});assert.equal(result.ready,false);assert.ok(result.missing.includes('DOCUMENT_STORAGE_PROVIDER'));});
test('launch readiness refuses deployment without a production malware scanner',()=>{const result=evaluateLaunchReadiness({...valid,FILE_MALWARE_SCANNER:'basic',CLAMAV_HOST:''});assert.equal(result.ready,false);assert.ok(result.missing.includes('FILE_MALWARE_SCANNER=clamav and CLAMAV_HOST'));});
test('launch readiness requires an explicit trusted-proxy decision',()=>{const result=evaluateLaunchReadiness({...valid,TRUST_PROXY:undefined});assert.equal(result.ready,false);assert.ok(result.missing.includes('TRUST_PROXY=true or TRUST_PROXY=false'));});

const governance = {
  COMPLIANCE_PROFILE:'security', SECURITY_PROGRAM_OWNER:'Atlas Security Officer',
  RISK_ASSESSMENT_REVIEWED_AT:'2026-06-01', INCIDENT_RESPONSE_PLAN_VERSION:'IR-2026.1',
  DATA_RETENTION_POLICY_VERSION:'RET-2026.1', BACKUP_RESTORE_TESTED_AT:'2026-06-15',
  ACCESS_REVIEW_COMPLETED_AT:'2026-06-20', SUBPROCESSOR_REGISTER_VERSION:'SUB-2026.1'
};

test('production launch fails closed when organization-level compliance evidence is absent',()=>{
  const result=evaluateLaunchReadiness({...valid,NODE_ENV:'production'});
  assert.equal(result.technicalReady,true);
  assert.equal(result.ready,false);
  assert.equal(result.assurance.enforced,true);
  assert.ok(result.missing.includes('SECURITY_PROGRAM_OWNER'));
  assert.equal(result.assurance.claims.iso27001Certified,false);
  assert.equal(result.assurance.claims.soc2ReportAvailable,false);
});

test('production security profile accepts current governance attestations without claiming certification',()=>{
  const result=evaluateLaunchReadiness({...valid,...governance,NODE_ENV:'production'});
  assert.equal(result.ready,true);
  assert.equal(result.assurance.operationalEvidenceReady,true);
  assert.equal(result.assurance.frameworks.find((item)=>item.id==='iso_27001').status,'ready_for_independent_or_legal_validation');
  assert.equal(result.assurance.claims.iso27001Certified,false);
});

test('GDPR and HIPAA profiles add their own operational and legal evidence gates',()=>{
  const base={...valid,...governance,NODE_ENV:'production',COMPLIANCE_PROFILE:'gdpr_hipaa'};
  const missing=evaluateLaunchReadiness(base);
  assert.equal(missing.ready,false);
  assert.ok(missing.missing.includes('RECORDS_OF_PROCESSING_VERSION'));
  assert.ok(missing.missing.includes('HIPAA_BAA_TEMPLATE_VERSION'));
  const complete=evaluateLaunchReadiness({...base,
    PRIVACY_PROGRAM_OWNER:'Atlas Privacy Officer',PRIVACY_NOTICE_VERSION:'PN-2026.1',DATA_PROCESSING_AGREEMENT_VERSION:'DPA-2026.1',
    RECORDS_OF_PROCESSING_VERSION:'ROPA-2026.1',DATA_SUBJECT_RIGHTS_PROCEDURE_VERSION:'DSR-2026.1',INTERNATIONAL_TRANSFER_MECHANISM:'EU SCC 2021/914',
    HIPAA_SECURITY_OFFICIAL:'Atlas Security Officer',HIPAA_RISK_ANALYSIS_REVIEWED_AT:'2026-06-01',HIPAA_BAA_TEMPLATE_VERSION:'BAA-2026.1',
    HIPAA_SUBCONTRACTOR_BAA_REGISTER_VERSION:'SBAA-2026.1',HIPAA_BREACH_PROCEDURE_VERSION:'HBR-2026.1',HIPAA_WORKFORCE_TRAINING_COMPLETED_AT:'2026-06-01'
  });
  assert.equal(complete.ready,true);
  assert.equal(complete.assurance.claims.gdprComplianceVerified,false);
  assert.equal(complete.assurance.claims.hipaaComplianceVerified,false);
});
