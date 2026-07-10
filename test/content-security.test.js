import test from 'node:test';
import assert from 'node:assert/strict';
import { AesGcmContentCipher, PlaintextContentCipher } from '../src/content-security.js';
import { AtlasAssistant, AtlasToolRegistry } from '../src/assistant.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

const key = Buffer.alloc(32, 7).toString('base64');

test('AES-256-GCM content envelopes round-trip without exposing plaintext', () => {
  const cipher = new AesGcmContentCipher({ keys: { current: key }, activeKeyId: 'current' });
  const first = cipher.encrypt('privileged legal strategy', 'run:one:prompt');
  const second = cipher.encrypt('privileged legal strategy', 'run:one:prompt');
  assert.match(first, /^atlas:v1:current:/);
  assert.ok(!first.includes('privileged'));
  assert.notEqual(first, second);
  assert.equal(cipher.decrypt(first, 'run:one:prompt'), 'privileged legal strategy');
});

test('authenticated encryption rejects tampering and record-context substitution', () => {
  const cipher = new AesGcmContentCipher({ keys: { current: key }, activeKeyId: 'current' });
  const encrypted = cipher.encrypt('confidential', 'message:one:content');
  assert.throws(() => cipher.decrypt(encrypted, 'message:two:content'), (error) => error.code === 'AI_CONTENT_DECRYPTION_FAILED');
  assert.throws(() => cipher.decrypt(`${encrypted.slice(0, -1)}A`, 'message:one:content'), (error) => error.code === 'AI_CONTENT_DECRYPTION_FAILED');
});

test('keyrings decrypt older envelopes while new content uses the active key', () => {
  const oldKey = Buffer.alloc(32, 3).toString('base64');
  const oldCipher = new AesGcmContentCipher({ keys: { old: oldKey }, activeKeyId: 'old' });
  const encrypted = oldCipher.encrypt('retained history', 'run:old:answer');
  const rotated = new AesGcmContentCipher({ keys: { old: oldKey, current: key }, activeKeyId: 'current' });
  assert.equal(rotated.decrypt(encrypted, 'run:old:answer'), 'retained history');
  assert.match(rotated.encrypt('new content'), /^atlas:v1:current:/);
});

test('legacy plaintext remains readable for controlled migration', () => {
  const cipher = new AesGcmContentCipher({ keys: { current: key }, activeKeyId: 'current' });
  assert.equal(cipher.decrypt('legacy row', 'any'), 'legacy row');
  assert.equal(new PlaintextContentCipher().encrypt('development'), 'development');
});

test('assistant encrypts repository content and decrypts authorized API results and history', async () => {
  const repository = new InMemoryRepository();
  const service = new AtlasService(repository);
  const workspace = await service.createWorkspace({ name: 'Encrypted Firm' });
  const seen = [];
  const model = { async complete(input) { seen.push(input.messages); return { text: 'Protected answer' }; } };
  const cipher = new AesGcmContentCipher({ keys: { current: key }, activeKeyId: 'current' });
  const assistant = new AtlasAssistant(model, new AtlasToolRegistry(service), { repository, contentCipher: cipher });
  const first = await assistant.query({ workspaceId: workspace.id, userId: 'usr_1', prompt: 'Sensitive question' });
  await assistant.query({ workspaceId: workspace.id, userId: 'usr_1', conversationId: first.conversationId, prompt: 'Follow up' });

  const rawRuns = await repository.listAiRuns(workspace.id, 10);
  const rawConversations = await repository.listAiConversations(workspace.id, 'usr_1');
  const rawMessages = await repository.listAiMessages(workspace.id, 'usr_1', first.conversationId);
  assert.ok(rawRuns.every((run) => run.prompt.startsWith('atlas:v1:') && run.answer.startsWith('atlas:v1:')));
  assert.ok(rawConversations[0].title.startsWith('atlas:v1:'));
  assert.ok(rawMessages.every((message) => message.content.startsWith('atlas:v1:')));
  assert.deepEqual(seen[1].map((message) => `${message.role}:${message.content}`), ['user:Sensitive question', 'assistant:Protected answer', 'user:Follow up']);
  assert.equal((await assistant.listRuns(workspace.id))[0].prompt, 'Follow up');
  assert.equal((await assistant.listConversations(workspace.id, 'usr_1'))[0].title, 'Sensitive question');
  assert.deepEqual((await assistant.listMessages(workspace.id, 'usr_1', first.conversationId)).map((message) => message.content), ['Sensitive question', 'Protected answer', 'Follow up', 'Protected answer']);
});
