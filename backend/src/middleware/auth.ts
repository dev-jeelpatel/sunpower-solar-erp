import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import type { Role } from '../lib/http';

export function verifyToken(token: string) {
  const p = jwt.verify(token, env.jwtSecret) as unknown as { sub: number; role: Role; name: string };
  return { id: Number(p.sub), role: p.role, name: p.name };
}

/** Verifies the Bearer token and attaches req.user = { id, role, name }. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(unauthorized('Your session has expired. Please sign in again'));
  }
}

/**
 * Role gate. admin always passes; director has read-only access everywhere.
 * Usage: router.post('/x', authorize('sales'), handler)
 */
export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const { role } = req.user;
    if (role === 'admin' || roles.includes(role)) return next();
    if (role === 'director' && req.method === 'GET') return next();
    next(forbidden());
  };
