import {createHash, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {verifyLocalPassword, type LocalAccount} from './localAccounts';
import type {VerifiedPrincipal} from '../../core/security/controlPolicyPrototype';
import {normalizeLocalEmail} from '../../core/security/localEmail';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const fingerprint = (account: LocalAccount) => digest(JSON.stringify(account));
const secret = () => randomBytes(32).toString('base64url');
type Session = {subject: string; sessionId: string; fingerprint: string; csrf: string; issuedAt: number; expiresAt: number; touchedAt: number};
export class AccessError extends Error {
  constructor(readonly status: number, message: string) {super(message);}
}
export class LocalSessions {
  private sessions = new Map<string,Session>();
  private attempts = new Map<string,{at: number; count: number}>();
  private hashing = 0;
  private dummy: LocalAccount['password'] = {algorithm:'scrypt-v1',salt:randomBytes(16).toString('hex'),digest:randomBytes(64).toString('hex')};
  constructor(private accounts: () => Promise<LocalAccount[]>, private clock = Date.now) {}
  private throttle(key: string, limit: number) {
    const now = this.clock();
    for (const [id,bucket] of this.attempts) if (now - bucket.at >= 60000) this.attempts.delete(id);
    const bucket = this.attempts.get(key) ?? {at:now,count:0};
    if (++bucket.count > limit) throw new AccessError(429,'Sign-in temporarily limited; try again later');
    this.attempts.set(key,bucket);
  }
  async login(inputEmail: unknown, password: unknown, peer: string) {
    this.throttle('global',20); this.throttle('peer:'+digest(peer),8);
    const email = normalizeLocalEmail(inputEmail);
    if (!email || typeof password !== 'string' || password.length > 256) throw new AccessError(401,'Invalid credentials');
    this.throttle('account:'+digest(email),5);
    if (this.hashing >= 2) throw new AccessError(429,'Sign-in temporarily busy');
    this.hashing++;
    try {
      const account = (await this.accounts()).find(row => row.email === email);
      const valid = await verifyLocalPassword(password,account?.password ?? this.dummy);
      if (!valid || !account || account.disabled) throw new AccessError(401,'Invalid credentials');
      // Re-read after the expensive hash so revocation during login cannot create a session.
      const current = (await this.accounts()).find(row => row.id === account.id);
      if (!current || current.disabled || fingerprint(current) !== fingerprint(account)) throw new AccessError(401,'Invalid credentials');
      const now = this.clock();
      for (const [key,value] of this.sessions) if (value.expiresAt <= now || now - value.touchedAt >= 15*60000) this.sessions.delete(key);
      if (this.sessions.size >= 128) throw new AccessError(503,'Session capacity reached');
      const token = secret(), csrf = secret();
      this.sessions.set(digest(token),{subject:account.id,sessionId:randomUUID(),fingerprint:fingerprint(account),csrf,issuedAt:now,expiresAt:now+8*3600000,touchedAt:now});
      return {token,csrf};
    } finally {this.hashing--;}
  }
  async authenticate(token: string | undefined, touch = true): Promise<{principal: VerifiedPrincipal; csrf: string; email: string; idleExpiresAt: number}> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AccessError(401,'Sign-in required');
    const key = digest(token), session = this.sessions.get(key), now = this.clock();
    if (!session || session.issuedAt > now || session.expiresAt <= now || now - session.touchedAt >= 15*60000) {
      this.sessions.delete(key); throw new AccessError(401,'Sign-in required');
    }
    const account = (await this.accounts()).find(row => row.id === session.subject);
    const checkedAt = this.clock();
    if (this.sessions.get(key) !== session || session.expiresAt <= checkedAt || checkedAt-session.touchedAt >= 15*60000) {
      this.sessions.delete(key); throw new AccessError(401,'Sign-in required');
    }
    if (!account || account.disabled || fingerprint(account) !== session.fingerprint) {
      this.sessions.delete(key); throw new AccessError(401,'Session revoked');
    }
    if (touch) session.touchedAt = checkedAt;
    return {email:account.email,idleExpiresAt:Math.min(session.expiresAt,session.touchedAt+15*60000),csrf:session.csrf,principal:{subject:session.subject,sessionId:session.sessionId,state:'active',issuedAt:session.issuedAt,expiresAt:session.expiresAt,grants:structuredClone(account.grants)}};
  }
  checkCsrf(expected: string, supplied: unknown) {
    if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) throw new AccessError(403,'Request token required');
  }
  logout(token: string) {this.sessions.delete(digest(token));}
}
