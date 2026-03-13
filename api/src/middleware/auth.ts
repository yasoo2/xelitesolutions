import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const isDev = process.env.NODE_ENV !== 'production';

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
    try {
      const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
      (req as AuthenticatedRequest).auth = payload;
      return next();
    } catch {
      // Token invalid — fall through to bypass check
    }
  }

  // FALLBACK: Only allow bypass in non-production environments
  if (isDev && process.env.ENABLE_AUTH_BYPASS === 'true') {
    console.warn('[AUTH] ⚠️ Auth bypass active (dev mode only). Do NOT use in production.');
    (req as AuthenticatedRequest).auth = { sub: '000000000000000000000001', role: 'OWNER' };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

export function authenticateOptional(req: Request, res: Response, next: NextFunction) {
  if (isDev && process.env.ENABLE_AUTH_BYPASS === 'true') {
    (req as AuthenticatedRequest).auth = { sub: '000000000000000000000001', role: 'OWNER' };
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    (req as AuthenticatedRequest).auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
// Super admin emails loaded from environment variable (comma-separated) instead of hardcoded
const SUPER_ADMIN_EMAILS: string[] = (() => {
  const raw = process.env.SUPER_ADMIN_EMAILS || '';
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
})();

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = (req as AuthenticatedRequest).auth;
  const email = auth?.email?.toLowerCase().trim() || '';
  const role = auth?.role;

  const isAdmin = role === 'SUPER_ADMIN' ||
    role === 'OWNER' ||
    SUPER_ADMIN_EMAILS.includes(email);

  if (!auth || !isAdmin) {
    console.warn(`[AUTH] requireSuperAdmin failed for: email=${email}, role=${role}`);
    return res.status(403).json({ error: 'Forbidden: Super Admin access required' });
  }
  next();
}
