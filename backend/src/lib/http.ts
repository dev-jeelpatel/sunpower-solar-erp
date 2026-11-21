import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type Role = 'admin' | 'sales' | 'technician' | 'warehouse' | 'support' | 'director';
export type AuthUser = { id: number; role: Role; name: string };

declare module 'express-serve-static-core' {
  interface Request {
    user: AuthUser;
  }
}

/** Wrap an async handler so rejected promises reach the error middleware. */
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** Route ids are validated as positive integers before controllers run. */
export const idOf = (req: Request, key = 'id') => Number(req.params[key]);

export function paging(query: Request['query']) {
  const limit = Math.min(Math.max(parseInt(String(query.limit), 10) || 20, 1), 100);
  const page = Math.max(parseInt(String(query.page), 10) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}

/** Optional string query param ('' and missing both become null). */
export const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  // control characters (for example a NUL byte) cannot be stored or searched in PostgreSQL
  // eslint-disable-next-line no-control-regex
  const clean = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100);
  return clean === '' ? null : clean;
};
