import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { hashPassword, verifyPassword, IdentityService, TokenService } from '../src/identity.js';

test('passwords use salted scrypt hashes and verify safely', async () => {
  const first = await hashPassword('correct horse battery staple');
  const second = await hashPassword('correct horse battery staple');
  assert.match(first, /^scrypt\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('correct horse battery staple', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
});

test('weak passwords are rejected', async () => {
  await assert.rejects(() => hashPassword('too-short'), (error) => error.code === 'WEAK_PASSWORD');
});

test('tokens reject tampering and expiration', async () => {
  let now = 1000;
  const tokens = new TokenService('a'.repeat(32), 60, () => now);
  const issued = tokens.issue({ id: 'usr_1', email: 'lawyer@example.com' });
  assert.equal(tokens.verify(issued.accessToken).sub, 'usr_1');
  await assert.rejects(async () => tokens.verify(`${issued.accessToken.slice(0, -1)}x`), (error) => error.code === 'INVALID_TOKEN');
  now = 1061;
  await assert.rejects(async () => tokens.verify(issued.accessToken), (error) => error.code === 'TOKEN_EXPIRED');
});

test('registration normalizes email and login rejects wrong passwords', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const registered = await identity.register({ email: ' Lawyer@Example.COM ', name: 'Lawyer', password: 'correct horse battery staple' });
  assert.equal(registered.user.email, 'lawyer@example.com');
  assert.ok(!('passwordHash' in registered.user));
  const loggedIn = await identity.login({ email: 'lawyer@example.com', password: 'correct horse battery staple' });
  assert.equal(loggedIn.user.id, registered.user.id);
  await assert.rejects(() => identity.login({ email: 'lawyer@example.com', password: 'incorrect password' }), (error) => error.code === 'INVALID_CREDENTIALS');
});

test('workspace roles enforce read, write, and membership administration', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const owner = await identity.register({ email: 'owner@example.com', name: 'Owner', password: 'owner password long enough' });
  const viewer = await identity.register({ email: 'viewer@example.com', name: 'Viewer', password: 'viewer password long enough' });
  const workspace = await repository.createWorkspace({ id: 'wsp_1', name: 'Firm', version: 1, createdAt: 'now', updatedAt: 'now' });
  await identity.addOwner(workspace.id, owner.user.id);
  await identity.addMembership(workspace.id, viewer.user.id, 'viewer');
  assert.equal((await identity.authorize(workspace.id, viewer.user.id, 'workspace:read')).role, 'viewer');
  await assert.rejects(() => identity.authorize(workspace.id, viewer.user.id, 'workspace:write'), (error) => error.code === 'ACCESS_DENIED');
  assert.equal((await identity.authorize(workspace.id, owner.user.id, 'members:admin')).role, 'owner');
});
