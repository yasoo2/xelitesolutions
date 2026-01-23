import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthPayload {
  sub: string;
  role: 'OWNER' | 'ADMIN' | 'USER';
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  // FALLBACK: Only allow bypass if explicitly check env var, NO HARDCODED TOKENS.
  if (process.env.ENABLE_AUTH_BYPASS === 'true') {
    (req as any).auth = { sub: 'offline_admin', role: 'OWNER' };
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
    (req as any).auth = { sub: 'offline_admin', role: 'OWNER' };
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
