import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import type { Role } from '../lib/http';
import { prisma, q } from '../lib/prisma';
import { verifyToken } from '../middleware/auth';

let io: Server | null = null;

/**
 * Real-time channel. Each signed-in browser joins a room per role (and per user), so the
 * server can push e.g. "new enquiry" to sales or "order ready to pack" to the warehouse instantly.
 */
export function initSocket(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.corsOrigin } });
  io.use((socket, next) => {
    try {
      socket.data.user = verifyToken(String(socket.handshake.auth?.token ?? ''));
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    const { id, role } = socket.data.user as { id: number; role: Role };
    socket.join([`role:${role}`, `user:${id}`]);
  });
  return io;
}

export type RealtimeEvent =
  | 'enquiry:new'
  | 'survey:scheduled'
  | 'survey:submitted'
  | 'order:confirmed'
  | 'payment:received'
  | 'dispatch:ready'
  | 'dispatch:delivered'
  | 'job:scheduled'
  | 'job:completed'
  | 'ticket:new'
  | 'ticket:assigned'
  | 'ticket:resolved'
  | 'stock:low';

type Payload = { title: string; link?: string } & Record<string, unknown>;

/**
 * Save one notification per person (so each has their own history and read state),
 * then push it to that person's browser if they are online.
 */
async function deliver(userIds: number[], event: RealtimeEvent, payload: Payload) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  const rows = await q<{ id: number; user_id: number; created_at: string }>(
    prisma,
    `INSERT INTO notifications (user_id, event, title, link)
     SELECT u, $2, $3, $4 FROM unnest($1::int[]) AS u RETURNING id, user_id, created_at`,
    [ids, event, payload.title.slice(0, 300), payload.link ?? null],
  );
  if (!io) return; // sockets are off in CLI scripts and tests; the saved copy is still there
  for (const r of rows) io.to(`user:${r.user_id}`).emit('notification', { id: Number(r.id), event, title: payload.title, link: payload.link ?? null, created_at: r.created_at, read_at: null });
}

const safely = (p: Promise<void>) => { p.catch((e) => console.error('notification failed:', e?.message ?? e)); };

/** Tell everyone with these roles (admin and director are always included). */
export const notify = (roles: Role[], event: RealtimeEvent, payload: Payload) => {
  const all = [...new Set<Role>([...roles, 'admin', 'director'])];
  safely(
    q<{ id: number }>(prisma, 'SELECT id FROM users WHERE active AND role::text = ANY($1::text[])', [all]).then((u) => deliver(u.map((x) => x.id), event, payload)),
  );
};

/** Tell specific people, e.g. the technician a job was assigned to. */
export const notifyUsers = (userIds: number[], event: RealtimeEvent, payload: Payload) => safely(deliver(userIds, event, payload));
