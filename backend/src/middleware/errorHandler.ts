import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { HttpError } from '../lib/errors';

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) =>
  next(new HttpError(404, `Route ${req.method} ${req.path} not found`));

/** PostgreSQL SQLSTATE surfaces through Prisma as meta.code (raw queries) or err.code. */
const pgCode = (err: any): string | undefined => err?.meta?.code ?? err?.code;

function fromDbError(err: any): HttpError | null {
  const message: string = err?.meta?.message ?? err?.message ?? '';
  switch (pgCode(err)) {
    case '23505':
    case 'P2002':
      return new HttpError(409, 'That value is already in use');
    case '23503':
    case 'P2003':
      return new HttpError(400, 'Referenced record does not exist or is still in use');
    case '23514':
      return new HttpError(
        422,
        env.isProd ? 'A value is outside the allowed range' : `A value is outside the allowed range (${message})`,
      );
    case '22P02':
      return new HttpError(400, 'Malformed value in request');
    case 'P0001': {
      // RAISE EXCEPTION from our triggers: surfaced as the human-readable message
      const m = message.match(/message: "([^"]*)"/) ?? message.match(/ERROR: (.*)$/m);
      return new HttpError(422, (m?.[1] ?? message).split('\n')[0].trim());
    }
    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  let e: unknown = err;
  if (err instanceof multer.MulterError) {
    e = new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be 5 MB or smaller' : err.message);
  } else if (err?.type === 'entity.parse.failed') {
    e = new HttpError(400, 'Request body is not valid JSON');
  } else if (err?.type === 'entity.too.large') {
    e = new HttpError(413, 'Request is too large');
  } else if (!(err instanceof HttpError) && (err instanceof Prisma.PrismaClientKnownRequestError || pgCode(err))) {
    e = fromDbError(err) ?? err;
  }

  if (e instanceof HttpError) {
    return res.status(e.status).json({ error: e.message, ...(e.fields ? { fields: e.fields } : {}) });
  }
  console.error(err);
  res.status(500).json({
    error: 'Something went wrong on our side. Please try again.',
    ...(env.isProd ? {} : { detail: err?.message }),
  });
}
