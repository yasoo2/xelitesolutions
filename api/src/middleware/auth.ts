import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthPayload {
  sub: string;
  role: 'OWNER' | 'ADMIN' | 'USER';
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
