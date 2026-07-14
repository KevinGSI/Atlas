import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLaunchReadiness } from '../scripts/launch-readiness.js';

const valid = {
  DATABASE_URL:'postgresql://atlas:secret@db.internal/atlas', AUTH_TOKEN_SECRET:'a'.repeat(48),MFA_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),
  AI_PROVIDER:'openai', AI_MODEL:'gpt-4.1-mini', OPENAI_API_KEY:'configured-api-key',
  AI_CONTENT_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'), CMS_CREDENTIAL_ENCRYPTION_KEY:Buffer.alloc(32,2).toString('base64'),
  GOOGLE_WORKSPACE_CLIENT_ID:'google-client-id', GOOGLE_WORKSPACE_CLIENT_SECRET:'google-client-secret',
  CMS_SYNC_ENABLED:'true', PUBLIC_BASE_URL:'https://atlas.example.test', TRUST_PROXY:'true', DOCUMENT_STORAGE_PROVIDER:'postgres', FILE_MALWARE_SCANNER:'clamav', CLAMAV_HOST:'clamav.internal'
};

test('launch readiness passes only a complete production pilot environment without exposing values',()=>{const result=evaluateLaunchReadiness(valid);assert.equal(result.ready,true);assert.ok(result.checks.every(item=>item.passed));const serialized=JSON.stringify(result);assert.equal(serialized.includes(valid.OPENAI_API_KEY),false);assert.equal(serialized.includes(valid.DATABASE_URL),false);});
test('launch readiness fails closed for missing mail synchronization and insecure public origins',()=>{const result=evaluateLaunchReadiness({...valid,GOOGLE_WORKSPACE_CLIENT_ID:'',GOOGLE_WORKSPACE_CLIENT_SECRET:'',CMS_SYNC_ENABLED:'false',PUBLIC_BASE_URL:'http://atlas.example.test'});assert.equal(result.ready,false);assert.ok(result.missing.includes('GOOGLE_WORKSPACE_* or MICROSOFT_365_*'));assert.ok(result.missing.includes('CMS_SYNC_ENABLED=true'));assert.ok(result.missing.includes('PUBLIC_BASE_URL'));});
test('launch readiness refuses ephemeral document storage',()=>{const result=evaluateLaunchReadiness({...valid,DOCUMENT_STORAGE_PROVIDER:'memory'});assert.equal(result.ready,false);assert.ok(result.missing.includes('DOCUMENT_STORAGE_PROVIDER'));});
test('launch readiness refuses deployment without a production malware scanner',()=>{const result=evaluateLaunchReadiness({...valid,FILE_MALWARE_SCANNER:'basic',CLAMAV_HOST:''});assert.equal(result.ready,false);assert.ok(result.missing.includes('FILE_MALWARE_SCANNER=clamav and CLAMAV_HOST'));});
test('launch readiness requires an explicit trusted-proxy decision',()=>{const result=evaluateLaunchReadiness({...valid,TRUST_PROXY:undefined});assert.equal(result.ready,false);assert.ok(result.missing.includes('TRUST_PROXY=true or TRUST_PROXY=false'));});
