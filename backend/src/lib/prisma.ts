import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export type Db = Prisma.TransactionClient | PrismaClient;
export type Row = Record<string, any>;

const isMidnightUtc = (d: Date) =>
  d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() + d.getUTCMilliseconds() === 0;

/**
 * Raw query results come back as Prisma.Decimal / bigint / Date. The API contract uses plain
 * numbers, and DATE columns as 'YYYY-MM-DD' strings (DATE values arrive as midnight-UTC Dates).
 */
function normalize(v: any): any {
  if (v === null || v === undefined) return v;
  if (typeof v === 'bigint') return Number(v);
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toNumber();
  if (v instanceof Date) return isMidnightUtc(v) ? v.toISOString().slice(0, 10) : v;
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalize(x)]));
  return v;
}

/** Parameterised SQL ($1, $2 ...). Never interpolate user input into `text`. */
export async function q<T = Row>(db: Db, text: string, params: unknown[] = []): Promise<T[]> {
  return normalize(await db.$queryRawUnsafe(text, ...params)) as T[];
}
export async function q1<T = Row>(db: Db, text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(db, text, params))[0];
}
export async function exec(db: Db, text: string, params: unknown[] = []): Promise<number> {
  return db.$executeRawUnsafe(text, ...params);
}

/** Interactive transaction (all-or-nothing). */
export const tx = <T>(fn: (db: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(fn, { timeout: 30000, maxWait: 10000 });

/** Append to the audit trail. */
export const logActivity = (
  db: Db,
  entity: string,
  entityId: number,
  action: string,
  userId: number | null = null,
  detail: unknown = null,
) =>
  exec(db, 'INSERT INTO activity_log (entity, entity_id, action, user_id, detail) VALUES ($1,$2,$3,$4,$5::jsonb)', [
    entity,
    entityId,
    action,
    userId,
    detail ? JSON.stringify(detail) : null,
  ]);
