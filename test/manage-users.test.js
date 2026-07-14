import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createAtlasHandler } from '../src/http.js';
import { IdentityService, TokenService } from '../src/identity.js';
import { InMemoryRepository } from '../src/repository.js';
import { AtlasService } from '../src/service.js';

function fixture(secret = 'm'.repeat(32)) {
  const repository = new InMemoryRepository();
  const identity = new IdentityService(repository, new TokenService(secret));
  const handler = createAtlasHandler(new AtlasService(repository), {
    identity,
    ready: async () => true,
    config: { maxBodyBytes: 1_048_576, corsOrigins: [] }
  });
  return { repository, identity, handler };
}

async function json(handler, url, options = {}) {
  const request = Readable.from(options.body ? [Buffer.from(options.body)] : []);
  request.method = options.method ?? 'GET';
  request.url = url;
  request.headers = options.headers ?? {};
  return new Promise((resolve, reject) => {
    const response = {
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body) { resolve({ status: this.status, body: JSON.parse(body), headers: this.headers }); }
    };
    Promise.resolve(handler(request, response)).catch(reject);
  });
}

async function raw(handler, url) {
  const request = Readable.from([]);
  request.method = 'GET';
  request.url = url;
  request.headers = {};
  return new Promise((resolve, reject) => {
    const response = {
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body) { resolve({ status: this.status, body: Buffer.from(body).toString('utf8'), headers: this.headers }); }
    };
    Promise.resolve(handler(request, response)).catch(reject);
  });
}

function bearer(accessToken) {
  return { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
}

async function register(identity, localPart, name = localPart) {
  return identity.register({
    email: `${localPart}@manage-users.test`,
    name,
    password: 'correct password long enough'
  });
}

test('owner and administrator see only their firm user directory with nonsecret security summaries', async () => {
  const { identity, handler } = fixture();
  const firm = await identity.registerFirm({
    firmName: 'Directory Firm',
    email: 'owner@directory.test',
    name: 'Directory Owner',
    password: 'correct password long enough'
  });
  const admin = await register(identity, 'directory-admin', 'Directory Admin');
  const attorney = await register(identity, 'directory-attorney', 'Directory Attorney');
  const viewer = await register(identity, 'directory-viewer', 'Directory Viewer');
  await identity.addMembership(firm.workspace.id, admin.user.id, 'admin');
  await identity.addMembership(firm.workspace.id, attorney.user.id, 'attorney');
  await identity.addMembership(firm.workspace.id, viewer.user.id, 'viewer');

  for (const accessToken of [firm.accessToken, admin.accessToken]) {
    const response = await json(handler, `/v1/workspaces/${firm.workspace.id}/memberships`, {
      headers: bearer(accessToken)
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 4);
    const member = response.body.data.find((item) => item.user.id === attorney.user.id);
    assert.equal(member.user.email, attorney.user.email);
    assert.equal(member.role, 'attorney');
    assert.equal(member.active, true);
    assert.deepEqual(Object.keys(member.security).sort(), ['activeSessionCount', 'lastSessionAt', 'mfaEnabled']);
    assert.equal(member.security.activeSessionCount, 1);
    const serialized = JSON.stringify(response.body.data);
    for (const secretName of ['passwordHash', 'tokenHash', 'refreshToken', 'mfaSecret', 'recoveryCodes']) {
      assert.equal(serialized.includes(secretName), false, `${secretName} must not leave the identity boundary`);
    }
  }

  const denied = await json(handler, `/v1/workspaces/${firm.workspace.id}/memberships`, {
    headers: bearer(viewer.accessToken)
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'ACCESS_DENIED');
});

test('an administrator can change an ordinary user role and the change revokes that user sessions', async () => {
  const { repository, identity, handler } = fixture('r'.repeat(32));
  const firm = await identity.registerFirm({
    firmName: 'Role Firm',
    email: 'owner@roles.test',
    name: 'Role Owner',
    password: 'correct password long enough'
  });
  const admin = await register(identity, 'role-admin', 'Role Admin');
  const attorney = await register(identity, 'role-attorney', 'Role Attorney');
  const viewer = await register(identity, 'role-viewer', 'Role Viewer');
  await identity.addMembership(firm.workspace.id, admin.user.id, 'admin');
  await identity.addMembership(firm.workspace.id, attorney.user.id, 'attorney');
  await identity.addMembership(firm.workspace.id, viewer.user.id, 'viewer');

  const changed = await json(handler, `/v1/workspaces/${firm.workspace.id}/memberships/${attorney.user.id}`, {
    method: 'PATCH',
    headers: bearer(admin.accessToken),
    body: JSON.stringify({ role: 'paralegal' })
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.role, 'paralegal');
  assert.equal(changed.body.data.sessionsRevoked, true);
  assert.equal((await identity.repository.getMembership(firm.workspace.id, attorney.user.id)).role, 'paralegal');

  const revoked = await json(handler, `/v1/workspaces/${firm.workspace.id}`, {
    headers: bearer(attorney.accessToken)
  });
  assert.equal(revoked.status, 401);
  assert.equal(revoked.body.error.code, 'ACCESS_TOKEN_REVOKED');

  const memberDenied = await json(handler, `/v1/workspaces/${firm.workspace.id}/memberships/${attorney.user.id}`, {
    method: 'PATCH',
    headers: bearer(viewer.accessToken),
    body: JSON.stringify({ role: 'billing' })
  });
  assert.equal(memberDenied.status, 403);
  assert.equal(memberDenied.body.error.code, 'ACCESS_DENIED');
  assert.equal((await repository.listSecurityEvents(firm.workspace.id)).some((event) => event.type === 'membership.role_changed'), true);
});

test('account removal is reversible firm access deactivation and immediately revokes active sessions', async () => {
  const { repository, identity, handler } = fixture('d'.repeat(32));
  const firm = await identity.registerFirm({
    firmName: 'Offboarding Firm',
    email: 'owner@offboarding.test',
    name: 'Offboarding Owner',
    password: 'correct password long enough'
  });
  const member = await register(identity, 'offboarding-member', 'Offboarding Member');
  await identity.addMembership(firm.workspace.id, member.user.id, 'paralegal');

  const deactivated = await json(handler, `/v1/workspaces/${firm.workspace.id}/memberships/${member.user.id}/deactivate`, {
    method: 'POST',
    headers: bearer(firm.accessToken),
    body: JSON.stringify({ reason: 'Employment ended' })
  });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.data.active, false);
  assert.equal(deactivated.body.data.sessionsRevoked, true);
  assert.equal(deactivated.body.data.deactivationReason, 'Employment ended');

  const revoked = await json(handler, `/v1/workspaces/${firm.workspace.id}`, {
    headers: bearer(member.accessToken)
  });
  assert.equal(revoked.status, 401);
  assert.equal(revoked.body.error.code, 'ACCESS_TOKEN_REVOKED');

  const reactivated = await json(handler, `/v1/workspaces/${firm.workspace.id}/memberships/${member.user.id}/reactivate`, {
    method: 'POST',
    headers: bearer(firm.accessToken),
    body: '{}'
  });
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.data.active, true);
  const relogged = await identity.login({
    email: member.user.email,
    password: 'correct password long enough'
  });
  assert.equal((await json(handler, `/v1/workspaces/${firm.workspace.id}`, { headers: bearer(relogged.accessToken) })).status, 200);
  const events = await repository.listSecurityEvents(firm.workspace.id);
  assert.equal(events.some((event) => event.type === 'membership.deactivated'), true);
  assert.equal(events.some((event) => event.type === 'membership.reactivated'), true);
});

test('owner, administrator, self-management, and cross-firm protections cannot be bypassed', async () => {
  const { identity, handler } = fixture('p'.repeat(32));
  const firstFirm = await identity.registerFirm({
    firmName: 'First Firm',
    email: 'owner@first-firm.test',
    name: 'First Owner',
    password: 'correct password long enough'
  });
  const firstAdmin = await register(identity, 'first-admin', 'First Admin');
  const secondAdmin = await register(identity, 'second-admin', 'Second Admin');
  const member = await register(identity, 'protected-member', 'Protected Member');
  await identity.addMembership(firstFirm.workspace.id, firstAdmin.user.id, 'admin');
  await identity.addMembership(firstFirm.workspace.id, secondAdmin.user.id, 'admin');
  await identity.addMembership(firstFirm.workspace.id, member.user.id, 'attorney');

  const ownerSelf = await json(handler, `/v1/workspaces/${firstFirm.workspace.id}/memberships/${firstFirm.user.id}`, {
    method: 'PATCH',
    headers: bearer(firstFirm.accessToken),
    body: JSON.stringify({ role: 'attorney' })
  });
  assert.equal(ownerSelf.status, 409);
  assert.equal(ownerSelf.body.error.code, 'MEMBERSHIP_PROTECTED');

  const adminTouchesOwner = await json(handler, `/v1/workspaces/${firstFirm.workspace.id}/memberships/${firstFirm.user.id}`, {
    method: 'PATCH',
    headers: bearer(firstAdmin.accessToken),
    body: JSON.stringify({ role: 'attorney' })
  });
  assert.equal(adminTouchesOwner.status, 409);
  assert.equal(adminTouchesOwner.body.error.code, 'MEMBERSHIP_PROTECTED');

  const adminTouchesAdmin = await json(handler, `/v1/workspaces/${firstFirm.workspace.id}/memberships/${secondAdmin.user.id}`, {
    method: 'PATCH',
    headers: bearer(firstAdmin.accessToken),
    body: JSON.stringify({ role: 'attorney' })
  });
  assert.equal(adminTouchesAdmin.status, 403);
  assert.equal(adminTouchesAdmin.body.error.code, 'ACCESS_DENIED');

  const adminEscalates = await json(handler, `/v1/workspaces/${firstFirm.workspace.id}/memberships/${member.user.id}`, {
    method: 'PATCH',
    headers: bearer(firstAdmin.accessToken),
    body: JSON.stringify({ role: 'admin' })
  });
  assert.equal(adminEscalates.status, 403);
  assert.equal(adminEscalates.body.error.code, 'ACCESS_DENIED');

  const ownerRoleRejected = await json(handler, `/v1/workspaces/${firstFirm.workspace.id}/memberships/${member.user.id}`, {
    method: 'PATCH',
    headers: bearer(firstFirm.accessToken),
    body: JSON.stringify({ role: 'owner' })
  });
  assert.equal(ownerRoleRejected.status, 400);
  assert.equal(ownerRoleRejected.body.error.code, 'INVALID_ROLE');

  const secondFirm = await identity.registerFirm({
    firmName: 'Second Firm',
    email: 'owner@second-firm.test',
    name: 'Second Owner',
    password: 'correct password long enough'
  });
  const crossFirm = await json(handler, `/v1/workspaces/${secondFirm.workspace.id}/memberships/${secondFirm.user.id}`, {
    method: 'PATCH',
    headers: bearer(firstAdmin.accessToken),
    body: JSON.stringify({ role: 'attorney' })
  });
  assert.equal(crossFirm.status, 403);
  assert.equal(crossFirm.body.error.code, 'ACCESS_DENIED');
});

test('direct user access uses the same administrator, role, invitation, and seat-limit controls',async()=>{
  const { repository,identity,handler }=fixture('a'.repeat(32));
  const firm=await identity.registerFirm({firmName:'Direct Access Firm',email:'owner@direct-access.test',name:'Direct Owner',password:'correct password long enough'});
  const admin=await register(identity,'direct-admin','Direct Admin');
  const target=await register(identity,'direct-target','Direct Target');
  const reserved=await register(identity,'direct-reserved','Direct Reserved');
  await identity.addMembership(firm.workspace.id,admin.user.id,'admin');
  const ownerHeaders=bearer(firm.accessToken);
  const adminHeaders=bearer(admin.accessToken);

  const pending=await json(handler,`/v1/workspaces/${firm.workspace.id}/invitations`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({email:target.user.email,role:'attorney'})});
  assert.equal(pending.status,201);
  const pendingConflict=await json(handler,`/v1/workspaces/${firm.workspace.id}/memberships`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({userId:target.user.id,role:'attorney'})});
  assert.equal(pendingConflict.status,409);
  assert.equal(pendingConflict.body.error.code,'INVITATION_EXISTS');

  const adminEscalation=await json(handler,`/v1/workspaces/${firm.workspace.id}/memberships`,{method:'POST',headers:adminHeaders,body:JSON.stringify({userId:target.user.id,role:'admin'})});
  assert.equal(adminEscalation.status,403);
  assert.equal(adminEscalation.body.error.code,'ACCESS_DENIED');
  const ownerRole=await json(handler,`/v1/workspaces/${firm.workspace.id}/memberships`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({userId:target.user.id,role:'owner'})});
  assert.equal(ownerRole.status,400);
  assert.equal(ownerRole.body.error.code,'INVALID_ROLE');

  assert.equal((await json(handler,`/v1/workspaces/${firm.workspace.id}/invitations/${pending.body.data.id}`,{method:'DELETE',headers:ownerHeaders})).status,200);
  const added=await json(handler,`/v1/workspaces/${firm.workspace.id}/memberships`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({userId:target.user.id,role:'attorney'})});
  assert.equal(added.status,201);
  assert.equal(added.body.data.role,'attorney');

  await repository.updateSubscription(firm.workspace.id,{seatLimit:4},'2026-07-14T12:00:00.000Z');
  assert.equal((await json(handler,`/v1/workspaces/${firm.workspace.id}/invitations`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({email:'reserved-seat@direct-access.test',role:'billing'})})).status,201);
  const seatDenied=await json(handler,`/v1/workspaces/${firm.workspace.id}/memberships`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({userId:reserved.user.id,role:'viewer'})});
  assert.equal(seatDenied.status,409);
  assert.equal(seatDenied.body.error.code,'SEAT_LIMIT_REACHED');

  const ordinaryDenied=await json(handler,`/v1/workspaces/${firm.workspace.id}/memberships`,{method:'POST',headers:bearer(target.accessToken),body:JSON.stringify({userId:reserved.user.id,role:'viewer'})});
  assert.equal(ordinaryDenied.status,403);
  assert.equal(ordinaryDenied.body.error.code,'ACCESS_DENIED');
});

test('an administrator can invite a user while ordinary users cannot, and pending invitations can be canceled', async () => {
  const { identity, handler } = fixture('i'.repeat(32));
  const firm = await identity.registerFirm({
    firmName: 'Invitation Firm',
    email: 'owner@invitation-firm.test',
    name: 'Invitation Owner',
    password: 'correct password long enough'
  });
  const admin = await register(identity, 'invitation-admin', 'Invitation Admin');
  const attorney = await register(identity, 'invitation-attorney', 'Invitation Attorney');
  await identity.addMembership(firm.workspace.id, admin.user.id, 'admin');
  await identity.addMembership(firm.workspace.id, attorney.user.id, 'attorney');

  const invited = await json(handler, `/v1/workspaces/${firm.workspace.id}/invitations`, {
    method: 'POST',
    headers: bearer(admin.accessToken),
    body: JSON.stringify({ email: 'new-user@invitation-firm.test', role: 'paralegal' })
  });
  assert.equal(invited.status, 201);
  assert.ok(invited.body.data.invitationToken);

  const accepted = await json(handler, '/v1/auth/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({
      invitationToken: invited.body.data.invitationToken,
      name: 'New User',
      password: 'correct password long enough'
    })
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.membership.role, 'paralegal');

  const memberDenied = await json(handler, `/v1/workspaces/${firm.workspace.id}/invitations`, {
    method: 'POST',
    headers: bearer(attorney.accessToken),
    body: JSON.stringify({ email: 'denied@invitation-firm.test', role: 'viewer' })
  });
  assert.equal(memberDenied.status, 403);
  assert.equal(memberDenied.body.error.code, 'ACCESS_DENIED');

  const pending = await json(handler, `/v1/workspaces/${firm.workspace.id}/invitations`, {
    method: 'POST',
    headers: bearer(admin.accessToken),
    body: JSON.stringify({ email: 'cancel@invitation-firm.test', role: 'billing' })
  });
  const canceled = await json(handler, `/v1/workspaces/${firm.workspace.id}/invitations/${pending.body.data.id}`, {
    method: 'DELETE',
    headers: bearer(admin.accessToken)
  });
  assert.equal(canceled.status, 200);
  assert.equal(canceled.body.data.status, 'canceled');
});

test('Account Info exposes an administrator-only Manage Users workflow backed by firm APIs', async () => {
  const { handler } = fixture('u'.repeat(32));
  const page = (await raw(handler, '/')).body;
  const script = (await raw(handler, '/app.js')).body;
  assert.match(page, /id="accountInfo"/);
  assert.match(script, /Manage Users/);
  assert.match(script, /dataset\.accountLink='manage-users'/);
  assert.match(script, /dataset\.accountPage='manage-users'/);
  assert.match(script, /#account\/manage-users/);
  assert.match(script, /memberships/);
  assert.match(script, /method:'PATCH'/);
  assert.match(script, /reactivate':'deactivate/);
  assert.match(script, /invitations/);
  assert.match(script, /owner.*admin|admin.*owner/);
  assert.match(script, /confirm\(/);
  assert.match(script, /Deactivate|Remove access/);
  assert.doesNotMatch(script, /method:'DELETE'.*memberships/);
});
