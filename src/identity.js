import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AtlasError, required } from './errors.js';
import { createId } from './ids.js';

const scrypt = promisify(scryptCallback);
const dummyPasswordHash = 'scrypt$16384$8$1$YXRsYXMtZHVtbXktc2FsdA$MTFgp77CaO1lpwhhuy-VhvfjmeBI4xBJgoDlcoruvkl5v05ss7zox1IMCOQx1JBIlCS264VtylZK8HzFwo76Jw';
const roles = new Set(['owner', 'admin', 'member', 'viewer']);
const permissions = {
  owner: new Set(['workspace:read', 'workspace:write', 'members:admin']),
  admin: new Set(['workspace:read', 'workspace:write', 'members:admin']),
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
  issue(user, sessionId = undefined) {
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const now = this.clock();
    const payload = encode({ sub: user.id, email: user.email, ...(sessionId ? { sid: sessionId } : {}), iat: now, exp: now + this.ttlSeconds });
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
  }
  publicUser(user) { return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt }; }
  async issueSession(user, repository = this.repository, familyId = createId('fam')) {
    const refreshToken = this.randomToken();
    const createdAt = this.clock();
    const expiresAt = new Date(new Date(createdAt).getTime() + this.refreshTokenTtlSeconds * 1000).toISOString();
    const session = await repository.createRefreshSession({
      id: createId('ses'), userId: user.id, familyId, tokenHash: hashToken(refreshToken),
      expiresAt, createdAt, usedAt: null, revokedAt: null, replacedBySessionId: null
    });
    return { ...this.tokens.issue(user, session.id), refreshToken, refreshTokenExpiresAt: session.expiresAt };
  }
  async register(input) {
    const email = required(input.email, 'email').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new AtlasError('INVALID_EMAIL', 'Email address is invalid', 400);
    const passwordHash = await hashPassword(input.password);
    return this.repository.transaction(async (repository) => {
      const user = await repository.createUser({ id: createId('usr'), email, name: required(input.name, 'name'), passwordHash, createdAt: this.clock() });
      return { user: this.publicUser(user), ...(await this.issueSession(user, repository)) };
    });
  }
  async login(input) {
    const email = required(input.email, 'email').trim().toLowerCase();
    const principalHash = hashToken(email);
    const now = this.clock();
    const throttle = await this.repository.getLoginThrottle(principalHash);
    if (throttle?.lockedUntil && new Date(throttle.lockedUntil).getTime() > new Date(now).getTime()) {
      throw new AtlasError('ACCOUNT_LOCKED', 'Too many failed login attempts; try again later', 429, { lockedUntil: throttle.lockedUntil });
    }
    let user;
    try { user = await this.repository.getUserByEmail(email); } catch { user = null; }
    const valid = await verifyPassword(input.password ?? '', user?.passwordHash ?? dummyPasswordHash);
    if (!user || !valid) {
      const failure = await this.repository.recordLoginFailure(principalHash, now, this.loginFailureWindowSeconds, this.loginFailureThreshold, this.loginLockSeconds);
      if (failure.lockedUntil) throw new AtlasError('ACCOUNT_LOCKED', 'Too many failed login attempts; try again later', 429, { lockedUntil: failure.lockedUntil });
      throw new AtlasError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    await this.repository.clearLoginThrottle(principalHash);
    return { user: this.publicUser(user), ...(await this.issueSession(user)) };
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
  async addMembership(workspaceId, userId, role) {
    if (!roles.has(role)) throw new AtlasError('INVALID_ROLE', 'Role is invalid', 400);
    return this.repository.createMembership({ id: createId('mem'), workspaceId, userId, role, createdAt: this.clock() });
  }
  async authorize(workspaceId, userId, permission) {
    const membership = await this.repository.getMembership(workspaceId, userId);
    if (!permissions[membership.role]?.has(permission)) throw new AtlasError('ACCESS_DENIED', 'Workspace permission denied', 403);
    return membership;
  }
}
