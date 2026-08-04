import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../shared/config';
const isDev = process.env.NODE_ENV === 'development';
export interface AuthPayload {
  sub: string;
  role: 'OWNER' | 'ADMIN' | 'USER' | 'SUPER_ADMIN';
  email?: string;
}

/** Typed request with auth payload — use instead of (req as any).auth */
export interface AuthenticatedRequest extends Request {
  auth?: AuthPayload;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  // Always try JWT first if a token is provided
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length);
    if (token && token !== 'null') {
      try {
        const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
        (req as AuthenticatedRequest).auth = payload;
        return next();
      } catch {
        // Token invalid — fall through to bypass check
      }
    }
  }

  // FALLBACK: Only allow bypass in non-production environments
  if (isDev && process.env.ENABLE_AUTH_BYPASS === 'true') {
    console.warn('[AUTH] ⚠️ Auth bypass active (dev mode only). Do NOT use in production.');
    (req as AuthenticatedRequest).auth = { sub: config.localUserId, role: 'OWNER' };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

export function authenticateOptional(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  
  // Try to verify token if provided
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length);
    if (token && token !== 'null') {
      try {
        const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
        (req as AuthenticatedRequest).auth = payload;
        return next();
      } catch {
        // Invalid token - in dev mode with bypass, continue anyway
        if (isDev && process.env.ENABLE_AUTH_BYPASS === 'true') {
          console.warn('[AUTH] Invalid token provided, but auth bypass is active (dev mode)');
          (req as AuthenticatedRequest).auth = { sub: config.localUserId, role: 'OWNER' };
          return next();
        }
        // In production or without bypass, reject invalid tokens
        return res.status(401).json({ error: 'Invalid token' });
      }
    }
  }
  
  // No token provided - allow in dev mode with bypass
  if (isDev && process.env.ENABLE_AUTH_BYPASS === 'true') {
    (req as AuthenticatedRequest).auth = { sub: config.localUserId, role: 'OWNER' };
    return next();
  }
  
  // No token and no bypass - continue without auth (optional auth)
  return next();
}
/**
 * WHO OWNS THIS INSTALLATION — decided by the operator, not by a race.
 *
 * Every sign-up path used `count === 0 ? 'OWNER' : 'USER'`: whoever registered
 * FIRST on an empty database became the owner, and OWNER is a super admin.
 * Online that is a race against the whole internet — a scanner that finds a
 * fresh deployment and POSTs /api/auth/register once owns the platform, and
 * the real owner arrives to find himself an ordinary user. Worse, the
 * «registration is closed» switch explicitly exempted the first user, so
 * closing registration did not close this.
 *
 * The answer is an allowlist the operator sets in the environment. Order of
 * arrival stops mattering. Read at call time, not at import time, so a test —
 * or a restart with a new value — sees the truth.
 */
export function superAdminEmails(): string[] {
  const raw = `${process.env.SUPER_ADMIN_EMAILS || ''},${process.env.ADMIN_EMAIL || ''}`;
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

/** True when the operator has named at least one owner for this installation. */
export function ownersConfigured(): boolean {
  return superAdminEmails().length > 0;
}

/**
 * The role a brand-new account gets.
 *
 * - named in the allowlist          → OWNER, whenever they sign up;
 * - allowlist set, not named        → USER, even if they are the very first;
 * - NO allowlist at all and the request came from this machine → the old
 *   first-user rule still applies, because a developer running Joe on a
 *   laptop must be able to create an account and get in. A public deployment
 *   without an allowlist can no longer mint an owner for a stranger.
 */
export function roleForNewAccount(input: { email: string; isFirstUser: boolean; isLoopback: boolean }): 'OWNER' | 'USER' {
  const email = String(input.email || '').trim().toLowerCase();
  if (email && superAdminEmails().includes(email)) return 'OWNER';
  if (!ownersConfigured() && input.isFirstUser && input.isLoopback) return 'OWNER';
  return 'USER';
}

/** Is this request from the machine Joe runs on? */
export function isLoopbackRequest(req: Request): boolean {
  const ip = String((req as any).ip || (req as any).socket?.remoteAddress || '');
  return ip === '127.0.0.1' || ip === '::1'
    || ip.startsWith('::ffff:127.0.0.1') || ip === 'localhost';
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = (req as AuthenticatedRequest).auth;
  const email = auth?.email?.toLowerCase().trim() || '';
  const role = auth?.role;

  const isAdmin = role === 'SUPER_ADMIN' ||
    role === 'OWNER' ||
    superAdminEmails().includes(email);

  if (!auth || !isAdmin) {
    console.warn(`[AUTH] requireSuperAdmin failed for: email=${email}, role=${role}`);
    return res.status(403).json({ error: 'Forbidden: Super Admin access required' });
  }
  next();
}
