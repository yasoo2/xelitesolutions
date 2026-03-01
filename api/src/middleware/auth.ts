import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthPayload {
  sub: string;
  role: 'OWNER' | 'ADMIN' | 'USER' | 'SUPER_ADMIN';
  email?: string;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  // FALLBACK: Only allow bypass if explicitly check env var, NO HARDCODED TOKENS.
  if (process.env.ENABLE_AUTH_BYPASS === 'true') {
    (req as any).auth = { sub: '000000000000000000000001', role: 'OWNER' };
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    (req as any).auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function authenticateOptional(req: Request, res: Response, next: NextFunction) {
  if (process.env.ENABLE_AUTH_BYPASS === 'true') {
    (req as any).auth = { sub: '000000000000000000000001', role: 'OWNER' };
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next();
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    (req as any).auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).auth as AuthPayload;
  const email = auth?.email?.toLowerCase().trim();
  const isAdmin = auth?.role === 'SUPER_ADMIN' ||
    email === 'info.auraaluxury@gmail.com' ||
    auth?.role === 'OWNER'; // Temporarily allow OWNER to access for debugging

  console.log(`[AUTH-DEBUG] requireSuperAdmin check: role=${auth?.role}, email=${auth?.email}, isAdmin=${isAdmin}`);

  if (!auth || !isAdmin) {
    return res.status(403).json({ error: `Forbidden: Super Admin access required. (Role: ${auth?.role || 'None'}, Email: ${auth?.email || 'None'})` });
  }
  next();
}
