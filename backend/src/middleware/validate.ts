import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from '../lib/errors';

/**
 * Validate req[source] against a zod schema. On failure responds 400 with
 * { error, fields: { fieldName: 'human message' } } so the UI can show
 * messages next to each input. On success the parsed data replaces the original.
 */
export const validate =
  (schema: ZodTypeAny, source: 'body' | 'query' | 'params' = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!fields[key]) fields[key] = issue.message;
      }
      return next(badRequest('Please correct the highlighted fields', fields));
    }
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
