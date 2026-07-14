import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AtlasError, required } from './errors.js';
import { createId } from './ids.js';
import { MfaService } from './mfa.js';

const scrypt = promisify(scryptCallback);
const dummyPasswordHash = 'scrypt$16384$8$1$YXRsYXMtZHVtbXktc2FsdA$MTFgp77CaO1lpwhhuy-VhvfjmeBI4xBJgoDlcoruvkl5v05ss7zox1IMCOQx1JBIlCS264VtylZK8HzFwo76Jw';
const roles = new Set(['owner', 'admin', 'attorney', 'paralegal', 'billing', 'member', 'viewer']);
const invitationRoles = new Set(['admin', 'attorney', 'paralegal', 'billing', 'member', 'viewer']);
const permissions = {
  owner: new Set(['workspace:read', 'workspace:write', 'members:admin']),
  admin: new Set(['workspace:read', 'workspace:write', 'members:admin']),
  attorney: new Set(['workspace:read', 'workspace:write']),
  paralegal: new Set(['workspace:read', 'workspace:write']),
  billing: new Set(['workspace:read', 'workspace:write']),
  member: new Set(['workspace:read', 'workspace:write']),
  viewer: new Set(['workspace:read'])
};

function encode(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function hashToken(value) { return createHash('sha256').update(value).digest('hex'); }

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12) throw new AtlasError('WEAK_PASSWORD', 'Password must contain at least 12 characters', 400);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  const [algorithm, n, r, p, saltValue, hashValue] = encoded.split('$');
  if (algorithm !== 'scrypt') return false;
  const expected = Buffer.from(hashValue, 'base64url');
  const actual = Buffer.from(await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p) }));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class TokenService {
  constructor(secret, ttlSeconds = 900, clock = () => Math.floor(Date.now() / 1000)) {
    this.secret = secret; this.ttlSeconds = ttlSeconds; this.clock = clock;
  }
  issue(user, sessionId = undefined, authMethods = ['password']) {
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const now = this.clock();
    const payload = encode({ sub: user.id, email: user.email, ...(sessionId ? { sid: sessionId } : {}), amr:authMethods, iat: now, exp: now + this.ttlSeconds });
    const signature = createHmac('sha256', this.secret).update(`${header}.${payload}`).digest('base64url');
    return { accessToken: `${header}.${payload}.${signature}`, tokenType: 'Bearer', expiresIn: this.ttlSeconds };
  }
  verify(token) {
    const parts = token?.split('.');
    if (parts?.length !== 3) throw new AtlasError('INVALID_TOKEN', 'Invalid access token', 401);
    const expected = createHmac('sha256', this.secret).update(`${parts[0]}.${parts[1]}`).digest();
    const actual = Buffer.from(parts[2], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AtlasError('INVALID_TOKEN', 'Invalid access token', 401);
    let payload;
    try { payload = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch { throw new AtlasError('INVALID_TOKEN', 'Invalid access token', 401); }
    if (!payload.sub || payload.exp <= this.clock()) throw new AtlasError('TOKEN_EXPIRED', 'Access token expired', 401);
    return payload;
  }
}

export class IdentityService {
  constructor(repository, tokenService, clock = () => new Date().toISOString(), options = {}) {
    this.repository = repository; this.tokens = tokenService; this.clock = clock;
    this.refreshTokenTtlSeconds = options.refreshTokenTtlSeconds ?? 2_592_000;
    this.passwordResetTtlSeconds = options.passwordResetTtlSeconds ?? 900;
    this.loginFailureThreshold = options.loginFailureThreshold ?? 5;
    this.loginFailureWindowSeconds = options.loginFailureWindowSeconds ?? 900;
    this.loginLockSeconds = options.loginLockSeconds ?? 900;
    this.randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
    this.deliverPasswordReset = options.deliverPasswordReset ?? (async () => {});
    this.mfa=options.mfaService??new MfaService(repository,{clock,nowMs:options.nowMs,encryptionSecret:options.mfaEncryptionSecret??tokenService.secret});
  }
  publicUser(user) { return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt }; }
  async issueSession(user, repository = this.repository, familyId = createId('fam'),authMethods=['password']) {
    const refreshToken = this.randomToken();
    const createdAt = this.clock();
    const expiresAt = new Date(new Date(createdAt).getTime() + this.refreshTokenTtlSeconds * 1000).toISOString();
    const session = await repository.createRefreshSession({
      id: createId('ses'), userId: user.id, familyId, tokenHash: hashToken(refreshToken),
      expiresAt, createdAt, usedAt: null, revokedAt: null, replacedBySessionId: null
    });
    return { ...this.tokens.issue(user, session.id,authMethods), refreshToken, refreshTokenExpiresAt: session.expiresAt };
  }
  async recordSecurityEvent({userId=null,workspaceId=null,type,outcome,context={},details={}},repository=this.repository){return repository.createSecurityEvent({id:createId('sec'),userId,workspaceId,type,outcome,ipAddress:String(context.ipAddress??'').slice(0,128)||null,userAgent:String(context.userAgent??'').slice(0,500)||null,details,createdAt:this.clock()});}
  async register(input) {
    const email = required(input.email, 'email').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new AtlasError('INVALID_EMAIL', 'Email address is invalid', 400);
    const passwordHash = await hashPassword(input.password);
    return this.repository.transaction(async (repository) => {
      const user = await repository.createUser({ id: createId('usr'), email, name: required(input.name, 'name'), passwordHash, createdAt: this.clock() });
      return { user: this.publicUser(user), ...(await this.issueSession(user, repository)) };
    });
  }
  async registerFirm(input){
    const email=required(input.email,'email').trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(email))throw new AtlasError('INVALID_EMAIL','Email address is invalid',400);
    const passwordHash=await hashPassword(input.password);const now=this.clock();
    return this.repository.transaction(async(repository)=>{
      const user=await repository.createUser({id:createId('usr'),email,name:required(input.name,'name'),passwordHash,createdAt:now});
      const workspace=await repository.createWorkspace({id:createId('wsp'),name:required(input.firmName,'firmName'),createdAt:now,updatedAt:now,version:1});
      await repository.createMembership({id:createId('mem'),workspaceId:workspace.id,userId:user.id,role:'owner',createdAt:now});
      const subscription=await repository.createSubscription({id:createId('sub'),workspaceId:workspace.id,plan:'pilot',status:'trialing',seatLimit:10,trialEndsAt:null,currentPeriodEndsAt:null,createdAt:now,updatedAt:now});
      return {user:this.publicUser(user),workspace,subscription,...(await this.issueSession(user,repository))};
    });
  }
  async login(input,context={}) {
    const email = required(input.email, 'email').trim().toLowerCase();
    const principalHash = hashToken(email);
    const now = this.clock();
    const throttle = await this.repository.getLoginThrottle(principalHash);
    if (throttle?.lockedUntil && new Date(throttle.lockedUntil).getTime() > new Date(now).getTime()) {
      await this.recordSecurityEvent({type:'login',outcome:'blocked',context,details:{reason:'rate_limited'}});
      throw new AtlasError('ACCOUNT_LOCKED', 'Too many failed login attempts; try again later', 429, { lockedUntil: throttle.lockedUntil });
    }
    let user;
    try { user = await this.repository.getUserByEmail(email); } catch { user = null; }
    const valid = await verifyPassword(input.password ?? '', user?.passwordHash ?? dummyPasswordHash);
    if (!user || !valid) {
      const failure = await this.repository.recordLoginFailure(principalHash, now, this.loginFailureWindowSeconds, this.loginFailureThreshold, this.loginLockSeconds);
      await this.recordSecurityEvent({userId:user?.id??null,type:'login',outcome:failure.lockedUntil?'blocked':'failure',context,details:{reason:failure.lockedUntil?'rate_limited':'invalid_credentials'}});
      if (failure.lockedUntil) throw new AtlasError('ACCOUNT_LOCKED', 'Too many failed login attempts; try again later', 429, { lockedUntil: failure.lockedUntil });
      throw new AtlasError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    const mfaStatus=await this.mfa.status(user.id);let authMethods=['password'];
    if(mfaStatus.enabled){if(!input.mfaCode){await this.recordSecurityEvent({userId:user.id,type:'login',outcome:'blocked',context,details:{reason:'mfa_required'}});throw new AtlasError('MFA_REQUIRED','An authenticator or recovery code is required',401);}
      try{const verified=await this.mfa.verify(user.id,input.mfaCode);authMethods.push(verified.method);}catch(error){await this.repository.recordLoginFailure(principalHash,now,this.loginFailureWindowSeconds,this.loginFailureThreshold,this.loginLockSeconds);await this.recordSecurityEvent({userId:user.id,type:'login',outcome:'failure',context,details:{reason:'invalid_mfa'}});throw error;}}
    await this.repository.clearLoginThrottle(principalHash);
    const issued={ user: this.publicUser(user), ...(await this.issueSession(user,this.repository,createId('fam'),authMethods)) };await this.recordSecurityEvent({userId:user.id,type:'login',outcome:'success',context,details:{sessionId:this.tokens.verify(issued.accessToken).sid,mfa:mfaStatus.enabled}});return issued;
  }
  async refresh(input) {
    const refreshToken = required(input.refreshToken, 'refreshToken');
    const result = await this.repository.transaction(async (repository) => {
      const session = await repository.getRefreshSessionByHash(hashToken(refreshToken));
      const now = this.clock();
      if (session.revokedAt || session.usedAt) {
        await repository.revokeRefreshFamily(session.familyId, now);
        return { reuseDetected: true };
      }
      if (new Date(session.expiresAt).getTime() <= new Date(now).getTime()) {
        await repository.revokeRefreshSession(session.id, now);
        throw new AtlasError('REFRESH_TOKEN_EXPIRED', 'Refresh token expired', 401);
      }
      const user = await repository.getUser(session.userId);
      const next = await this.issueSession(user, repository, session.familyId);
      const replacement = await repository.getRefreshSessionByHash(hashToken(next.refreshToken));
      await repository.consumeRefreshSession(session.id, now, replacement.id);
      return { user: this.publicUser(user), ...next };
    });
    if (result.reuseDetected) throw new AtlasError('REFRESH_TOKEN_REUSED', 'Refresh token reuse detected; session family revoked', 401);
    return result;
  }
  async logout(input) {
    const refreshToken = required(input.refreshToken, 'refreshToken');
    const session = await this.repository.getRefreshSessionByHash(hashToken(refreshToken));
    if (!session.revokedAt) await this.repository.revokeRefreshSession(session.id, this.clock());
    return { revoked: true };
  }
  publicSession(session, currentSessionId) {
    const now = new Date(this.clock()).getTime();
    const status = session.revokedAt ? 'revoked'
      : session.usedAt ? 'rotated'
        : new Date(session.expiresAt).getTime() <= now ? 'expired' : 'active';
    return {
      id: session.id, status, current: session.id === currentSessionId,
      createdAt: session.createdAt, expiresAt: session.expiresAt,
      usedAt: session.usedAt, revokedAt: session.revokedAt
    };
  }
  async listSessions(userId, currentSessionId) {
    const sessions = await this.repository.listRefreshSessions(userId);
    return sessions.map((session) => this.publicSession(session, currentSessionId));
  }
  async revokeSession(userId, sessionId) {
    const session = await this.repository.getRefreshSession(userId, sessionId);
    if (!session.revokedAt) await this.repository.revokeRefreshSession(session.id, this.clock());
    return { revoked: true, sessionId };
  }
  async revokeAllSessions(userId) {
    await this.repository.revokeRefreshSessionsForUser(userId, this.clock());
    return { revoked: true };
  }
  async mfaStatus(userId){return this.mfa.status(userId);}
  async beginMfa(userId,input){const user=await this.repository.getUser(userId);if(!await verifyPassword(input.password??'',user.passwordHash))throw new AtlasError('INVALID_CREDENTIALS','Current password is invalid',401);const enrollment=await this.mfa.begin(user);await this.recordSecurityEvent({userId,type:'mfa.enrollment_started',outcome:'success'});return enrollment;}
  async confirmMfa(userId,input){const result=await this.mfa.confirm(userId,required(input.code,'code'));await this.repository.revokeRefreshSessionsForUser(userId,this.clock());await this.recordSecurityEvent({userId,type:'mfa.enabled',outcome:'success'});return {...result,sessionsRevoked:true};}
  async disableMfa(userId,input){const memberships=(await this.repository.listMembershipsForUser(userId)).filter(item=>item.active!==false);for(const membership of memberships){const policy=await this.repository.getWorkspaceSecurityPolicy(membership.workspaceId);if(policy.requireMfa)throw new AtlasError('FIRM_MFA_REQUIRED','This firm requires multi-factor authentication',409,{workspaceId:membership.workspaceId});}const user=await this.repository.getUser(userId);if(!await verifyPassword(input.password??'',user.passwordHash))throw new AtlasError('INVALID_CREDENTIALS','Current password is invalid',401);const result=await this.mfa.disable(userId,required(input.code,'code'));await this.repository.revokeRefreshSessionsForUser(userId,this.clock());await this.recordSecurityEvent({userId,type:'mfa.disabled',outcome:'success'});return {...result,sessionsRevoked:true};}
  async listWorkspaceSessions(workspaceId,currentSessionId){const sessions=await this.repository.listWorkspaceRefreshSessions(workspaceId);return sessions.map(session=>({...this.publicSession(session,currentSessionId),user:{id:session.user.id,email:session.user.email,name:session.user.name}}));}
  async listWorkspaceSecurityEvents(workspaceId,limit=100){return this.repository.listSecurityEvents(workspaceId,Math.min(Math.max(Number(limit)||100,1),500));}
  async revokeWorkspaceSessions(workspaceId,actorId){await this.recordSecurityEvent({userId:actorId,workspaceId,type:'firm.sessions_revoked',outcome:'success'});await this.repository.revokeRefreshSessionsForWorkspace(workspaceId,this.clock());return {revoked:true,workspaceId};}
  async requestPasswordReset(input) {
    const email = required(input.email, 'email').trim().toLowerCase();
    let user;
    try { user = await this.repository.getUserByEmail(email); }
    catch { return { accepted: true }; }
    const resetToken = this.randomToken();
    const createdAt = this.clock();
    const expiresAt = new Date(new Date(createdAt).getTime() + this.passwordResetTtlSeconds * 1000).toISOString();
    await this.repository.createPasswordReset({
      id: createId('rst'), userId: user.id, tokenHash: hashToken(resetToken),
      expiresAt, createdAt, usedAt: null
    });
    try { await this.deliverPasswordReset({ email: user.email, name: user.name, resetToken, expiresAt }); }
    catch { /* Keep the public response indistinguishable from an unknown account. */ }
    return { accepted: true };
  }
  async resetPassword(input) {
    const resetToken = required(input.resetToken, 'resetToken');
    const passwordHash = await hashPassword(input.password);
    return this.repository.transaction(async (repository) => {
      const reset = await repository.getPasswordResetByHash(hashToken(resetToken));
      const now = this.clock();
      if (reset.usedAt) throw new AtlasError('PASSWORD_RESET_USED', 'Password reset token has already been used', 401);
      if (new Date(reset.expiresAt).getTime() <= new Date(now).getTime()) {
        throw new AtlasError('PASSWORD_RESET_EXPIRED', 'Password reset token expired', 401);
      }
      await repository.updateUserPassword(reset.userId, passwordHash);
      await repository.consumePasswordReset(reset.id, now);
      await repository.invalidatePasswordResetsForUser(reset.userId, now);
      await repository.revokeRefreshSessionsForUser(reset.userId, now);
      return { reset: true };
    });
  }
  async authenticate(header) {
    if (!header?.startsWith('Bearer ')) throw new AtlasError('AUTHENTICATION_REQUIRED', 'Bearer access token required', 401);
    const payload = this.tokens.verify(header.slice(7));
    if (!payload.sid) throw new AtlasError('ACCESS_TOKEN_SESSION_REQUIRED', 'Access token is not bound to a session', 401);
    let session;
    try { session = await this.repository.getRefreshSession(payload.sub, payload.sid); }
    catch (error) {
      if (error instanceof AtlasError && error.code === 'SESSION_NOT_FOUND') {
        throw new AtlasError('ACCESS_TOKEN_REVOKED', 'Access token session is no longer valid', 401);
      }
      throw error;
    }
    const expired = new Date(session.expiresAt).getTime() <= new Date(this.clock()).getTime();
    if (session.revokedAt || session.usedAt || expired) {
      throw new AtlasError('ACCESS_TOKEN_REVOKED', 'Access token session is no longer valid', 401);
    }
    return { ...(await this.repository.getUser(payload.sub)), sessionId: payload.sid };
  }
  async addOwner(workspaceId, userId) { return this.addMembership(workspaceId, userId, 'owner'); }
  async getUserProfile(userId){return this.publicUser(await this.repository.getUser(userId));}
  async listUserWorkspaces(userId){const memberships=(await this.repository.listMembershipsForUser(userId)).filter(item=>item.active!==false);return Promise.all(memberships.map(async membership=>({workspace:await this.repository.getWorkspace(membership.workspaceId),subscription:await this.repository.getSubscription(membership.workspaceId),role:membership.role})));}
  async membershipAdministrator(workspaceId,actorId){const actor=await this.repository.getMembership(workspaceId,actorId);if(actor.active===false)throw new AtlasError('MEMBERSHIP_DEACTIVATED','Your access to this firm has been deactivated',403);if(!['owner','admin'].includes(actor.role))throw new AtlasError('ACCESS_DENIED','Firm administrator permission required',403);return actor;}
  assertAssignableManagedRole(actor,role){if(!invitationRoles.has(role))throw new AtlasError('INVALID_ROLE','Managed user role is invalid',400);if(role==='admin'&&actor.role!=='owner')throw new AtlasError('ACCESS_DENIED','Only a firm owner can assign the administrator role',403);}
  assertManageableMembership(actor,target){if(target.userId===actor.userId)throw new AtlasError('MEMBERSHIP_PROTECTED','You cannot change your own firm access',409);if(target.role==='owner')throw new AtlasError('MEMBERSHIP_PROTECTED','Firm owner access is protected',409);if(actor.role==='admin'&&target.role==='admin')throw new AtlasError('ACCESS_DENIED','Only a firm owner can manage an administrator',403);}
  async listWorkspaceMembers(workspaceId,actorId){await this.membershipAdministrator(workspaceId,actorId);const memberships=await this.repository.listMemberships(workspaceId);const sessions=await this.repository.listWorkspaceRefreshSessions(workspaceId);const now=new Date(this.clock()).getTime();return Promise.all(memberships.map(async membership=>{const status=await this.mfa.status(membership.userId);const memberSessions=sessions.filter(session=>session.userId===membership.userId);const activeSessionCount=memberSessions.filter(session=>!session.revokedAt&&!session.usedAt&&new Date(session.expiresAt).getTime()>now).length;return {...membership,user:this.publicUser(await this.repository.getUser(membership.userId)),mfaEnabled:status.enabled,security:{mfaEnabled:status.enabled,activeSessionCount,lastSessionAt:memberSessions[0]?.createdAt??null}};}));}
  async getWorkspaceSecurityPolicy(workspaceId){return this.repository.getWorkspaceSecurityPolicy(workspaceId);}
  async updateWorkspaceSecurityPolicy(workspaceId,input,actorId){if(typeof input.requireMfa!=='boolean')throw new AtlasError('INVALID_SECURITY_POLICY','requireMfa must be true or false',400);if(input.requireMfa&&!(await this.mfa.status(actorId)).enabled)throw new AtlasError('MFA_REQUIRED_TO_ENFORCE','Enable MFA on your own account before requiring it for the firm',409);const now=this.clock();const policy=await this.repository.upsertWorkspaceSecurityPolicy({workspaceId,requireMfa:input.requireMfa,updatedBy:actorId,createdAt:now,updatedAt:now});await this.recordSecurityEvent({userId:actorId,workspaceId,type:'firm.mfa_policy_changed',outcome:'success',details:{requireMfa:policy.requireMfa}});return policy;}
  async updateMembershipRole(workspaceId,targetUserId,input,actorId){const actor=await this.membershipAdministrator(workspaceId,actorId);const target=await this.repository.getMembership(workspaceId,targetUserId);this.assertManageableMembership(actor,target);const role=required(input.role,'role');this.assertAssignableManagedRole(actor,role);if(target.role===role)return {...target,sessionsRevoked:false};return this.repository.transaction(async repository=>{const updated=await repository.updateMembershipRole(workspaceId,targetUserId,role);await repository.revokeRefreshSessionsForUser(targetUserId,this.clock());await this.recordSecurityEvent({userId:actorId,workspaceId,type:'membership.role_changed',outcome:'success',details:{targetUserId,previousRole:target.role,role}},repository);return {...updated,sessionsRevoked:true};});}
  async deactivateMembership(workspaceId,targetUserId,input,actorId){const actor=await this.membershipAdministrator(workspaceId,actorId);const target=await this.repository.getMembership(workspaceId,targetUserId);this.assertManageableMembership(actor,target);const reason=String(input.reason??'').trim().slice(0,500)||null;if(target.active===false)return {...target,sessionsRevoked:false};return this.repository.transaction(async repository=>{const now=this.clock();const updated=await repository.updateMembershipAccess(workspaceId,targetUserId,{active:false,deactivatedAt:now,deactivatedBy:actorId,deactivationReason:reason});await repository.revokeRefreshSessionsForUser(targetUserId,now);await this.recordSecurityEvent({userId:actorId,workspaceId,type:'membership.deactivated',outcome:'success',details:{targetUserId,reason}},repository);return {...updated,sessionsRevoked:true};});}
  async reactivateMembership(workspaceId,targetUserId,actorId){const actor=await this.membershipAdministrator(workspaceId,actorId);const target=await this.repository.getMembership(workspaceId,targetUserId);this.assertManageableMembership(actor,target);if(target.active!==false)return target;const now=this.clock();await this.repository.cancelExpiredWorkspaceInvitations(workspaceId,now);const subscription=await this.repository.getSubscription(workspaceId);const active=(await this.repository.listMemberships(workspaceId)).filter(item=>item.active!==false);const pending=(await this.repository.listWorkspaceInvitations(workspaceId)).filter(item=>item.status==='pending'&&new Date(item.expiresAt)>new Date(now));if(active.length+pending.length>=subscription.seatLimit)throw new AtlasError('SEAT_LIMIT_REACHED','Firm subscription seat limit reached',409,{seatLimit:subscription.seatLimit});return this.repository.transaction(async repository=>{const updated=await repository.updateMembershipAccess(workspaceId,targetUserId,{active:true,deactivatedAt:null,deactivatedBy:null,deactivationReason:null});await this.recordSecurityEvent({userId:actorId,workspaceId,type:'membership.reactivated',outcome:'success',details:{targetUserId}},repository);return updated;});}
  async inviteMember(workspaceId,input,invitedBy){
    const email=required(input.email,'email').trim().toLowerCase();const role=required(input.role,'role');
    if(!/^\S+@\S+\.\S+$/.test(email))throw new AtlasError('INVALID_EMAIL','Email address is invalid',400);
    const actor=await this.membershipAdministrator(workspaceId,invitedBy);this.assertAssignableManagedRole(actor,role);
    const invitationToken=this.randomToken();return this.repository.transaction(async repository=>{const now=this.clock();await repository.cancelExpiredWorkspaceInvitations(workspaceId,now);const subscription=await repository.getSubscription(workspaceId);const memberships=await repository.listMemberships(workspaceId);const active=memberships.filter(item=>item.active!==false);const pending=(await repository.listWorkspaceInvitations(workspaceId)).filter(item=>item.status==='pending'&&new Date(item.expiresAt)>new Date(now));if(active.length+pending.length>=subscription.seatLimit)throw new AtlasError('SEAT_LIMIT_REACHED','Firm subscription seat limit reached',409,{seatLimit:subscription.seatLimit});try{const user=await repository.getUserByEmail(email);if(memberships.some(item=>item.userId===user.id))throw new AtlasError('MEMBERSHIP_EXISTS','User already belongs to this firm',409);}catch(error){if(!(error instanceof AtlasError)||error.code!=='INVALID_CREDENTIALS')throw error;}const expiresAt=new Date(new Date(now).getTime()+7*86_400_000).toISOString();const invitation=await repository.createWorkspaceInvitation({id:createId('inv'),workspaceId,email,role,tokenHash:hashToken(invitationToken),status:'pending',invitedBy,acceptedBy:null,expiresAt,createdAt:now,acceptedAt:null});await this.recordSecurityEvent({userId:invitedBy,workspaceId,type:'membership.invited',outcome:'success',details:{invitationId:invitation.id,email,role}},repository);const {tokenHash,...safe}=invitation;return {...safe,invitationToken};});
  }
  async listWorkspaceInvitations(workspaceId,actorId){if(actorId)await this.membershipAdministrator(workspaceId,actorId);const now=this.clock();await this.repository.cancelExpiredWorkspaceInvitations(workspaceId,now);return (await this.repository.listWorkspaceInvitations(workspaceId)).map(({tokenHash,...safe})=>safe);}
  async cancelWorkspaceInvitation(workspaceId,invitationId,actorId){const actor=await this.membershipAdministrator(workspaceId,actorId);return this.repository.transaction(async repository=>{const invitation=await repository.getWorkspaceInvitation(workspaceId,invitationId);if(actor.role==='admin'&&invitation.role==='admin')throw new AtlasError('ACCESS_DENIED','Only a firm owner can manage an administrator invitation',403);const canceled=await repository.cancelWorkspaceInvitation(workspaceId,invitationId);await this.recordSecurityEvent({userId:actorId,workspaceId,type:'membership.invitation_canceled',outcome:'success',details:{invitationId,email:invitation.email,role:invitation.role}},repository);const {tokenHash,...safe}=canceled;return safe;});}
  async acceptInvitation(input){
    const invitationToken=required(input.invitationToken,'invitationToken');
    return this.repository.transaction(async(repository)=>{
      const invitation=await repository.getWorkspaceInvitationByTokenHash(hashToken(invitationToken));const now=this.clock();
      if(invitation.status!=='pending')throw new AtlasError('INVITATION_INVALID','Invitation is invalid or already used',401);
      if(new Date(invitation.expiresAt)<=new Date(now))throw new AtlasError('INVITATION_EXPIRED','Invitation has expired',401);
      const subscription=await repository.getSubscription(invitation.workspaceId);if(!['trialing','active'].includes(subscription.status))throw new AtlasError('SUBSCRIPTION_INACTIVE','Firm subscription is not active',402,{status:subscription.status});
      const memberships=await repository.listMemberships(invitation.workspaceId);if(memberships.filter(item=>item.active!==false).length>=subscription.seatLimit)throw new AtlasError('SEAT_LIMIT_REACHED','Firm subscription seat limit reached',409,{seatLimit:subscription.seatLimit});
      let user;try{user=await repository.getUserByEmail(invitation.email);}catch(error){if(!(error instanceof AtlasError)||error.code!=='INVALID_CREDENTIALS')throw error;user=null;}
      if(user){if(!await verifyPassword(input.password??'',user.passwordHash))throw new AtlasError('INVALID_CREDENTIALS','Existing Atlas users must enter their current password',401);}
      else{const passwordHash=await hashPassword(input.password);user=await repository.createUser({id:createId('usr'),email:invitation.email,name:required(input.name,'name'),passwordHash,createdAt:now});}
      const membership=await repository.createMembership({id:createId('mem'),workspaceId:invitation.workspaceId,userId:user.id,role:invitation.role,createdAt:now});await repository.acceptWorkspaceInvitation(invitation.id,user.id,now);const workspace=await repository.getWorkspace(invitation.workspaceId);
      return {user:this.publicUser(user),workspace,membership,...(await this.issueSession(user,repository))};
    });
  }
  async addMembership(workspaceId, userId, role) {
    if (!roles.has(role)) throw new AtlasError('INVALID_ROLE', 'Role is invalid', 400);
    const subscription=await this.repository.getSubscription(workspaceId);
    const memberships=(await this.repository.listMemberships(workspaceId)).filter(item=>item.active!==false);
    if(memberships.length>=subscription.seatLimit)throw new AtlasError('SEAT_LIMIT_REACHED','Firm subscription seat limit reached',409,{seatLimit:subscription.seatLimit});
    return this.repository.createMembership({ id: createId('mem'), workspaceId, userId, role, createdAt: this.clock() });
  }
  async addManagedMembership(workspaceId,userId,role,actorId){const actor=await this.membershipAdministrator(workspaceId,actorId);this.assertAssignableManagedRole(actor,role);return this.repository.transaction(async repository=>{const now=this.clock();await repository.cancelExpiredWorkspaceInvitations(workspaceId,now);const subscription=await repository.getSubscription(workspaceId);const memberships=(await repository.listMemberships(workspaceId)).filter(item=>item.active!==false);const pending=(await repository.listWorkspaceInvitations(workspaceId)).filter(item=>item.status==='pending'&&new Date(item.expiresAt)>new Date(now));if(memberships.length+pending.length>=subscription.seatLimit)throw new AtlasError('SEAT_LIMIT_REACHED','Firm subscription seat limit reached',409,{seatLimit:subscription.seatLimit});const target=await repository.getUser(userId);if(pending.some(item=>item.email.toLowerCase()===target.email.toLowerCase()))throw new AtlasError('INVITATION_EXISTS','Cancel the pending invitation before adding direct access',409);const created=await repository.createMembership({id:createId('mem'),workspaceId,userId,role,createdAt:now});await this.recordSecurityEvent({userId:actorId,workspaceId,type:'membership.added',outcome:'success',details:{targetUserId:userId,role}},repository);return created;});}
  async authorize(workspaceId, userId, permission) {
    const membership = await this.repository.getMembership(workspaceId, userId);
    if(membership.active===false)throw new AtlasError('MEMBERSHIP_DEACTIVATED','Your access to this firm has been deactivated',403);
    const subscription=await this.repository.getSubscription(workspaceId);
    if(!['trialing','active'].includes(subscription.status))throw new AtlasError('SUBSCRIPTION_INACTIVE','Firm subscription is not active',402,{status:subscription.status});
    const policy=await this.repository.getWorkspaceSecurityPolicy(workspaceId);if(policy.requireMfa&&!(await this.mfa.status(userId)).enabled)throw new AtlasError('FIRM_MFA_REQUIRED','This firm requires multi-factor authentication. Open Settings and enable MFA to continue.',403,{workspaceId});
    if (!permissions[membership.role]?.has(permission)) throw new AtlasError('ACCESS_DENIED', 'Workspace permission denied', 403);
    return membership;
  }
}
