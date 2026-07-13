import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryRepository } from '../src/repository.js';
import { hashPassword, verifyPassword, IdentityService, TokenService } from '../src/identity.js';
import { AtlasService } from '../src/service.js';
import { MfaService,totp } from '../src/mfa.js';

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

test('access tokens can identify the refresh session that issued them', () => {
  const tokens = new TokenService('a'.repeat(32), 60, () => 1000);
  const issued = tokens.issue({ id: 'usr_1', email: 'lawyer@example.com' }, 'ses_current');
  assert.equal(tokens.verify(issued.accessToken).sid, 'ses_current');
});

test('registration normalizes email and login rejects wrong passwords', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const registered = await identity.register({ email: ' Lawyer@Example.COM ', name: 'Lawyer', password: 'correct horse battery staple' });
  assert.equal(registered.user.email, 'lawyer@example.com');
  assert.ok(!('passwordHash' in registered.user));
  const loggedIn = await identity.login({ email: 'lawyer@example.com', password: 'correct horse battery staple' });
  assert.equal(loggedIn.user.id, registered.user.id);
  assert.ok(registered.refreshToken);
  await assert.rejects(() => identity.login({ email: 'lawyer@example.com', password: 'incorrect password' }), (error) => error.code === 'INVALID_CREDENTIALS');
});

test('refresh tokens rotate once and reuse revokes the entire session family', async () => {
  let now = new Date('2026-07-10T12:00:00.000Z');
  let sequence = 0;
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), () => now.toISOString(), {
    refreshTokenTtlSeconds: 3600, randomToken: () => `refresh-token-${++sequence}`
  });
  const registered = await identity.register({ email: 'rotate@example.com', name: 'Rotate', password: 'correct horse battery staple' });
  const rotated = await identity.refresh({ refreshToken: registered.refreshToken });
  assert.notEqual(rotated.refreshToken, registered.refreshToken);
  await assert.rejects(() => identity.refresh({ refreshToken: registered.refreshToken }), (error) => error.code === 'REFRESH_TOKEN_REUSED');
  await assert.rejects(() => identity.refresh({ refreshToken: rotated.refreshToken }), (error) => error.code === 'REFRESH_TOKEN_REUSED');
});

test('logout revokes a refresh token and expired refresh tokens are rejected', async () => {
  let now = new Date('2026-07-10T12:00:00.000Z');
  let sequence = 0;
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), () => now.toISOString(), {
    refreshTokenTtlSeconds: 60, randomToken: () => `refresh-token-${++sequence}`
  });
  const first = await identity.register({ email: 'logout@example.com', name: 'Logout', password: 'correct horse battery staple' });
  assert.deepEqual(await identity.logout({ refreshToken: first.refreshToken }), { revoked: true });
  await assert.rejects(() => identity.refresh({ refreshToken: first.refreshToken }), (error) => error.code === 'REFRESH_TOKEN_REUSED');
  const second = await identity.login({ email: 'logout@example.com', password: 'correct horse battery staple' });
  now = new Date('2026-07-10T12:01:01.000Z');
  await assert.rejects(() => identity.refresh({ refreshToken: second.refreshToken }), (error) => error.code === 'REFRESH_TOKEN_EXPIRED');
});

test('registration rolls back the user when refresh-session persistence fails', async () => {
  const repository = new InMemoryRepository();
  repository.createRefreshSession = () => { throw new Error('forced session failure'); };
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  await assert.rejects(() => identity.register({ email: 'rollback@example.com', name: 'Rollback', password: 'correct horse battery staple' }), /forced session failure/);
  assert.throws(() => repository.getUserByEmail('rollback@example.com'), (error) => error.code === 'INVALID_CREDENTIALS');
});

test('password reset is single-use, changes credentials, and revokes existing sessions', async () => {
  let delivered;
  let sequence = 0;
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), () => '2026-07-10T12:00:00.000Z', {
    randomToken: () => `secret-${++sequence}`,
    deliverPasswordReset: async (message) => { delivered = message; }
  });
  const registered = await identity.register({ email: 'recover@example.com', name: 'Recover', password: 'original password long enough' });
  assert.deepEqual(await identity.requestPasswordReset({ email: 'recover@example.com' }), { accepted: true });
  assert.equal(delivered.email, 'recover@example.com');
  assert.deepEqual(await identity.resetPassword({ resetToken: delivered.resetToken, password: 'replacement password long enough' }), { reset: true });
  await assert.rejects(() => identity.login({ email: 'recover@example.com', password: 'original password long enough' }), (error) => error.code === 'INVALID_CREDENTIALS');
  assert.equal((await identity.login({ email: 'recover@example.com', password: 'replacement password long enough' })).user.id, registered.user.id);
  await assert.rejects(() => identity.refresh({ refreshToken: registered.refreshToken }), (error) => error.code === 'REFRESH_TOKEN_REUSED');
  await assert.rejects(() => identity.resetPassword({ resetToken: delivered.resetToken, password: 'another replacement password' }), (error) => error.code === 'PASSWORD_RESET_USED');
});

test('password-reset requests do not reveal unknown accounts and expired tokens fail', async () => {
  let delivered;
  let now = new Date('2026-07-10T12:00:00.000Z');
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), () => now.toISOString(), {
    passwordResetTtlSeconds: 60, randomToken: () => 'expiring-secret',
    deliverPasswordReset: async (message) => { delivered = message; }
  });
  assert.deepEqual(await identity.requestPasswordReset({ email: 'missing@example.com' }), { accepted: true });
  assert.equal(delivered, undefined);
  await identity.register({ email: 'expire@example.com', name: 'Expire', password: 'original password long enough' });
  await identity.requestPasswordReset({ email: 'expire@example.com' });
  now = new Date('2026-07-10T12:01:01.000Z');
  await assert.rejects(() => identity.resetPassword({ resetToken: delivered.resetToken, password: 'replacement password long enough' }), (error) => error.code === 'PASSWORD_RESET_EXPIRED');
});

test('completing a reset invalidates every other outstanding reset token', async () => {
  const delivered = [];
  let sequence = 0;
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), undefined, {
    randomToken: () => `multi-reset-${++sequence}`,
    deliverPasswordReset: async (message) => { delivered.push(message); }
  });
  await identity.register({ email: 'multiple@example.com', name: 'Multiple', password: 'original password long enough' });
  await identity.requestPasswordReset({ email: 'multiple@example.com' });
  await identity.requestPasswordReset({ email: 'multiple@example.com' });
  await identity.resetPassword({ resetToken: delivered[1].resetToken, password: 'replacement password long enough' });
  await assert.rejects(() => identity.resetPassword({ resetToken: delivered[0].resetToken, password: 'another replacement password' }), (error) => error.code === 'PASSWORD_RESET_USED');
});

test('password-reset delivery failure keeps the generic anti-enumeration response', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), undefined, {
    deliverPasswordReset: async () => { throw new Error('mail unavailable'); }
  });
  await identity.register({ email: 'delivery@example.com', name: 'Delivery', password: 'original password long enough' });
  assert.deepEqual(await identity.requestPasswordReset({ email: 'delivery@example.com' }), { accepted: true });
  assert.deepEqual(await identity.requestPasswordReset({ email: 'missing@example.com' }), { accepted: true });
});

test('users can inspect and revoke only their own sessions', async () => {
  let sequence = 0;
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), undefined, {
    randomToken: () => `session-secret-${++sequence}`
  });
  const first = await identity.register({ email: 'sessions@example.com', name: 'Sessions', password: 'original password long enough' });
  const second = await identity.login({ email: 'sessions@example.com', password: 'original password long enough' });
  const currentSessionId = identity.tokens.verify(second.accessToken).sid;
  const sessions = await identity.listSessions(first.user.id, currentSessionId);
  assert.equal(sessions.length, 2);
  assert.equal(sessions.find((session) => session.current).id, currentSessionId);
  assert.ok(sessions.every((session) => !('tokenHash' in session) && !('familyId' in session)));
  const other = await identity.register({ email: 'other-sessions@example.com', name: 'Other', password: 'original password long enough' });
  const otherSessionId = identity.tokens.verify(other.accessToken).sid;
  await assert.rejects(() => identity.revokeSession(first.user.id, otherSessionId), (error) => error.code === 'SESSION_NOT_FOUND');
  await identity.revokeSession(first.user.id, currentSessionId);
  await assert.rejects(() => identity.refresh({ refreshToken: second.refreshToken }), (error) => error.code === 'REFRESH_TOKEN_REUSED');
});

test('global logout revokes every refresh session for the authenticated user', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const first = await identity.register({ email: 'global@example.com', name: 'Global', password: 'original password long enough' });
  const second = await identity.login({ email: 'global@example.com', password: 'original password long enough' });
  assert.deepEqual(await identity.revokeAllSessions(first.user.id), { revoked: true });
  await assert.rejects(() => identity.refresh({ refreshToken: first.refreshToken }), (error) => error.code === 'REFRESH_TOKEN_REUSED');
  await assert.rejects(() => identity.refresh({ refreshToken: second.refreshToken }), (error) => error.code === 'REFRESH_TOKEN_REUSED');
});

test('authentication immediately rejects access tokens from revoked and rotated sessions', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const first = await identity.register({ email: 'immediate@example.com', name: 'Immediate', password: 'original password long enough' });
  assert.equal((await identity.authenticate(`Bearer ${first.accessToken}`)).id, first.user.id);
  const rotated = await identity.refresh({ refreshToken: first.refreshToken });
  await assert.rejects(() => identity.authenticate(`Bearer ${first.accessToken}`), (error) => error.code === 'ACCESS_TOKEN_REVOKED');
  assert.equal((await identity.authenticate(`Bearer ${rotated.accessToken}`)).id, first.user.id);
  await identity.logout({ refreshToken: rotated.refreshToken });
  await assert.rejects(() => identity.authenticate(`Bearer ${rotated.accessToken}`), (error) => error.code === 'ACCESS_TOKEN_REVOKED');
});

test('authentication rejects unbound and refresh-expired session access tokens', async () => {
  let identityNow = new Date('2026-07-10T12:00:00.000Z');
  const repository = new InMemoryRepository();
  const tokens = new TokenService('a'.repeat(32), 3600, () => 1000);
  const identity = new IdentityService(repository, tokens, () => identityNow.toISOString(), { refreshTokenTtlSeconds: 60 });
  const registered = await identity.register({ email: 'session-expiry@example.com', name: 'Expiry', password: 'original password long enough' });
  identityNow = new Date('2026-07-10T12:01:01.000Z');
  await assert.rejects(() => identity.authenticate(`Bearer ${registered.accessToken}`), (error) => error.code === 'ACCESS_TOKEN_REVOKED');
  const unbound = tokens.issue({ id: registered.user.id, email: registered.user.email });
  await assert.rejects(() => identity.authenticate(`Bearer ${unbound.accessToken}`), (error) => error.code === 'ACCESS_TOKEN_SESSION_REQUIRED');
});

test('failed logins trigger timed lockout and successful login clears failures', async () => {
  let now = new Date('2026-07-10T12:00:00.000Z');
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), () => now.toISOString(), {
    loginFailureThreshold: 3, loginFailureWindowSeconds: 300, loginLockSeconds: 60
  });
  await identity.register({ email: 'lockout@example.com', name: 'Lockout', password: 'correct password long enough' });
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await assert.rejects(() => identity.login({ email: 'lockout@example.com', password: 'wrong password' }), (error) => error.code === 'INVALID_CREDENTIALS');
  }
  await assert.rejects(() => identity.login({ email: 'lockout@example.com', password: 'wrong password' }), (error) => error.code === 'ACCOUNT_LOCKED' && error.status === 429);
  await assert.rejects(() => identity.login({ email: 'lockout@example.com', password: 'correct password long enough' }), (error) => error.code === 'ACCOUNT_LOCKED');
  now = new Date('2026-07-10T12:01:01.000Z');
  assert.equal((await identity.login({ email: 'lockout@example.com', password: 'correct password long enough' })).user.email, 'lockout@example.com');
  await assert.rejects(() => identity.login({ email: 'lockout@example.com', password: 'wrong password' }), (error) => error.code === 'INVALID_CREDENTIALS');
});

test('unknown and known principals receive the same throttling response sequence', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), undefined, {
    loginFailureThreshold: 2, loginFailureWindowSeconds: 300, loginLockSeconds: 60
  });
  await identity.register({ email: 'known@example.com', name: 'Known', password: 'correct password long enough' });
  for (const email of ['known@example.com', 'missing@example.com']) {
    await assert.rejects(() => identity.login({ email, password: 'wrong password' }), (error) => error.code === 'INVALID_CREDENTIALS');
    await assert.rejects(() => identity.login({ email, password: 'wrong password' }), (error) => error.code === 'ACCOUNT_LOCKED');
  }
});

test('enabled authenticator MFA is required at login and recorded in token assurance',async()=>{const repository=new InMemoryRepository();const now=Date.parse('2026-07-13T12:00:00.000Z');const mfa=new MfaService(repository,{encryptionSecret:'separate-mfa-key',nowMs:()=>now,clock:()=>new Date(now).toISOString(),randomBytes:(size)=>Buffer.alloc(size,5)});const identity=new IdentityService(repository,new TokenService('a'.repeat(32),900,()=>Math.floor(now/1000)),()=>new Date(now).toISOString(),{mfaService:mfa});const registered=await identity.register({email:'mfa@example.test',name:'MFA Lawyer',password:'correct password long enough'});const enrollment=await identity.beginMfa(registered.user.id,{password:'correct password long enough'});await identity.confirmMfa(registered.user.id,{code:totp(enrollment.secret,now)});await assert.rejects(()=>identity.login({email:'mfa@example.test',password:'correct password long enough'}),error=>error.code==='MFA_REQUIRED');await assert.rejects(()=>identity.login({email:'mfa@example.test',password:'correct password long enough',mfaCode:'000000'}),error=>error.code==='MFA_CODE_INVALID');const loggedIn=await identity.login({email:'mfa@example.test',password:'correct password long enough',mfaCode:totp(enrollment.secret,now)},{ipAddress:'192.0.2.5',userAgent:'Atlas security test'});assert.deepEqual(identity.tokens.verify(loggedIn.accessToken).amr,['password','totp']);});

test('firm administrators can inspect security activity and revoke every firm session',async()=>{const repository=new InMemoryRepository();const identity=new IdentityService(repository,new TokenService('a'.repeat(32)));const owner=await identity.register({email:'security-owner@example.test',name:'Owner',password:'correct password long enough'});const member=await identity.register({email:'security-member@example.test',name:'Member',password:'correct password long enough'});const workspace=await new AtlasService(repository).createWorkspace({name:'Secure Firm'},owner.user.id);await identity.addMembership(workspace.id,member.user.id,'attorney');const memberLogin=await identity.login({email:'security-member@example.test',password:'correct password long enough'},{ipAddress:'198.51.100.4',userAgent:'Test browser'});const events=await identity.listWorkspaceSecurityEvents(workspace.id);assert.equal(events.some(event=>event.userId===member.user.id&&event.ipAddress==='198.51.100.4'),true);const sessions=await identity.listWorkspaceSessions(workspace.id,identity.tokens.verify(owner.accessToken).sid);assert.equal(sessions.some(session=>session.user.email==='security-member@example.test'),true);await identity.revokeWorkspaceSessions(workspace.id,owner.user.id);await assert.rejects(()=>identity.authenticate(`Bearer ${memberLogin.accessToken}`),error=>error.code==='ACCESS_TOKEN_REVOKED');});

test('firm-wide MFA policy blocks firm work until each active member enrolls',async()=>{const repository=new InMemoryRepository();const now=Date.parse('2026-07-13T12:00:00.000Z');const mfa=new MfaService(repository,{encryptionSecret:'firm-policy-mfa-key',nowMs:()=>now,clock:()=>new Date(now).toISOString(),randomBytes:(size)=>Buffer.alloc(size,7)});const identity=new IdentityService(repository,new TokenService('p'.repeat(32),900,()=>Math.floor(now/1000)),()=>new Date(now).toISOString(),{mfaService:mfa});const owner=await identity.registerFirm({firmName:'Policy Firm',email:'owner@policy.test',name:'Owner',password:'correct password long enough'});const member=await identity.register({email:'member@policy.test',name:'Member',password:'correct password long enough'});await identity.addMembership(owner.workspace.id,member.user.id,'attorney');await assert.rejects(()=>identity.updateWorkspaceSecurityPolicy(owner.workspace.id,{requireMfa:true},owner.user.id),error=>error.code==='MFA_REQUIRED_TO_ENFORCE');const ownerEnrollment=await identity.beginMfa(owner.user.id,{password:'correct password long enough'});await identity.confirmMfa(owner.user.id,{code:totp(ownerEnrollment.secret,now)});const policy=await identity.updateWorkspaceSecurityPolicy(owner.workspace.id,{requireMfa:true},owner.user.id);assert.equal(policy.requireMfa,true);await assert.rejects(()=>identity.authorize(owner.workspace.id,member.user.id,'workspace:read'),error=>error.code==='FIRM_MFA_REQUIRED');const memberEnrollment=await identity.beginMfa(member.user.id,{password:'correct password long enough'});await identity.confirmMfa(member.user.id,{code:totp(memberEnrollment.secret,now)});assert.equal((await identity.authorize(owner.workspace.id,member.user.id,'workspace:read')).role,'attorney');await assert.rejects(()=>identity.disableMfa(member.user.id,{password:'correct password long enough',code:totp(memberEnrollment.secret,now)}),error=>error.code==='FIRM_MFA_REQUIRED');});

test('firm deactivation immediately removes only the targeted firm access and is reversible',async()=>{const repository=new InMemoryRepository();const identity=new IdentityService(repository,new TokenService('d'.repeat(32)));const owner=await identity.registerFirm({firmName:'Access Firm',email:'owner@access.test',name:'Owner',password:'correct password long enough'});const member=await identity.register({email:'member@access.test',name:'Member',password:'correct password long enough'});await identity.addMembership(owner.workspace.id,member.user.id,'paralegal');assert.equal((await identity.listUserWorkspaces(member.user.id)).length,1);const deactivated=await identity.deactivateMembership(owner.workspace.id,member.user.id,{reason:'Employment ended'},owner.user.id);assert.equal(deactivated.active,false);assert.equal((await identity.listUserWorkspaces(member.user.id)).length,0);await assert.rejects(()=>identity.authorize(owner.workspace.id,member.user.id,'workspace:read'),error=>error.code==='MEMBERSHIP_DEACTIVATED');await assert.rejects(()=>identity.deactivateMembership(owner.workspace.id,owner.user.id,{},owner.user.id),error=>error.code==='MEMBERSHIP_PROTECTED');const reactivated=await identity.reactivateMembership(owner.workspace.id,member.user.id,owner.user.id);assert.equal(reactivated.active,true);assert.equal((await identity.authorize(owner.workspace.id,member.user.id,'workspace:read')).role,'paralegal');const events=await identity.listWorkspaceSecurityEvents(owner.workspace.id);assert.equal(events.some(event=>event.type==='membership.deactivated'),true);assert.equal(events.some(event=>event.type==='membership.reactivated'),true);});

test('password replacement rolls back if reset consumption fails', async () => {
  let delivered;
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)), undefined, {
    randomToken: () => 'rollback-reset-secret', deliverPasswordReset: async (message) => { delivered = message; }
  });
  await identity.register({ email: 'reset-rollback@example.com', name: 'Rollback', password: 'original password long enough' });
  await identity.requestPasswordReset({ email: 'reset-rollback@example.com' });
  repository.consumePasswordReset = () => { throw new Error('forced reset failure'); };
  await assert.rejects(() => identity.resetPassword({ resetToken: delivered.resetToken, password: 'replacement password long enough' }), /forced reset failure/);
  assert.equal((await identity.login({ email: 'reset-rollback@example.com', password: 'original password long enough' })).user.email, 'reset-rollback@example.com');
});

test('workspace roles enforce read, write, and membership administration', async () => {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService('a'.repeat(32)));
  const owner = await identity.register({ email: 'owner@example.com', name: 'Owner', password: 'owner password long enough' });
  const viewer = await identity.register({ email: 'viewer@example.com', name: 'Viewer', password: 'viewer password long enough' });
  const workspace = await new AtlasService(repository).createWorkspace({ name: 'Firm' },owner.user.id);
  await identity.addMembership(workspace.id, viewer.user.id, 'viewer');
  assert.equal((await identity.authorize(workspace.id, viewer.user.id, 'workspace:read')).role, 'viewer');
  await assert.rejects(() => identity.authorize(workspace.id, viewer.user.id, 'workspace:write'), (error) => error.code === 'ACCESS_DENIED');
  assert.equal((await identity.authorize(workspace.id, owner.user.id, 'members:admin')).role, 'owner');
});
