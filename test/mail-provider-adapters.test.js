import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleWorkspaceConnector, Microsoft365Connector } from '../src/mail-provider-adapters.js';

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, async json() { return body; } }; }

test('Google Workspace requests read-only offline consent and normalizes Gmail into canonical email records', async () => {
  const calls = [];
  const transport = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/messages/msg-1')) return response({
      id: 'msg-1', threadId: 'thread-1', historyId: '8', internalDate: String(Date.parse('2026-07-12T12:00:00.000Z')),
      payload: { headers: [
        { name: 'From', value: 'Client <client@example.com>' }, { name: 'To', value: 'lawyer@example.com' },
        { name: 'Subject', value: 'Discovery response' }, { name: 'Date', value: 'Sun, 12 Jul 2026 12:00:00 GMT' }
      ], mimeType: 'text/plain', body: { data: Buffer.from('Please review the attached response.').toString('base64url') } }
    });
    return response({ messages: [{ id: 'msg-1' }] });
  };
  const connector = new GoogleWorkspaceConnector({ clientId: 'google-client', clientSecret: 'secret', transport, clock: () => Date.parse('2026-07-13T12:00:00.000Z') });
  const authorization = connector.beginAuthorization({ state: 'state', codeChallenge: 'challenge', redirectUri: 'https://atlas.example/v1/cms/oauth/callback' });
  assert.match(authorization, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(authorization, /gmail\.readonly/); assert.match(authorization, /calendar\.readonly/); assert.match(authorization, /access_type=offline/);
  const batch = await connector.pull({ credentials: { access_token: 'google-token', expires_at: Date.parse('2026-07-13T13:00:00.000Z') } });
  assert.equal(batch.records[0].type, 'email'); assert.equal(batch.records[0].data.from, 'client@example.com'); assert.equal(batch.records[0].data.bodyText, 'Please review the attached response.');
  assert.equal(batch.nextCursor.resource, 'calendar'); assert.equal(calls.at(-1).options.headers.authorization, 'Bearer google-token');
});
test('Microsoft 365 refreshes expiring credentials and normalizes Graph mail without provider lock-in', async () => {
  const calls = [];
  const transport = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/token')) return response({ access_token: 'fresh-token', refresh_token: 'rotated-refresh', expires_in: 3600 });
    return response({ value: [{ id: 'mail-1', subject: 'Client callback', receivedDateTime: '2026-07-13T10:00:00.000Z', lastModifiedDateTime: '2026-07-13T10:01:00.000Z', from: { emailAddress: { address: 'client@example.com' } }, toRecipients: [{ emailAddress: { address: 'lawyer@example.com' } }], ccRecipients: [], body: { contentType: 'text', content: 'Please call me today.' }, hasAttachments: false, conversationId: 'conversation-1', changeKey: 'change-1' }] });
  };
  const connector = new Microsoft365Connector({ clientId: 'microsoft-client', clientSecret: 'secret', transport, clock: () => Date.parse('2026-07-13T12:00:00.000Z') });
  const authorization = connector.beginAuthorization({ state: 'state', codeChallenge: 'challenge', redirectUri: 'https://atlas.example/v1/cms/oauth/callback' });
  assert.match(authorization, /login\.microsoftonline\.com\/organizations\/oauth2\/v2\.0\/authorize/); assert.match(authorization, /Mail\.Read/); assert.match(authorization, /Calendars\.Read/);
  const batch = await connector.pull({ credentials: { access_token: 'expired-token', refresh_token: 'old-refresh', expires_at: 1 } });
  assert.equal(batch.credentials.access_token, 'fresh-token'); assert.equal(batch.credentials.refresh_token, 'rotated-refresh');
  assert.equal(batch.records[0].data.subject, 'Client callback'); assert.equal(batch.records[0].data.bodyText, 'Please call me today.');
  assert.equal(calls[1].options.headers.authorization, 'Bearer fresh-token');
});

test('mail provider capabilities remain read-only and provider-neutral', () => {
  for (const connector of [new GoogleWorkspaceConnector({ clientId: 'a', clientSecret: 'b' }), new Microsoft365Connector({ clientId: 'a', clientSecret: 'b' })]) {
    assert.deepEqual(connector.capabilities().resources, ['email', 'calendar']);
    assert.equal(connector.capabilities().readOnly, true);
    assert.equal(connector.capabilities().nativeIntelligence, true);
  }
});
