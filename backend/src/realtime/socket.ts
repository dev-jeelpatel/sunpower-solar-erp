import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import type { Role } from '../lib/http';
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
  | 'survey:submitted'
  | 'order:confirmed'
  | 'payment:received'
  | 'dispatch:ready'
  | 'dispatch:delivered'
  | 'job:scheduled'
  | 'job:completed'
  | 'ticket:new'
  | 'ticket:resolved';

type Payload = { title: string; link?: string } & Record<string, unknown>;

const send = (rooms: string[], event: RealtimeEvent, payload: Payload) => {
  if (!io || rooms.length === 0) return; // no-op when sockets are off (CLI scripts, tests)
  io.to(rooms).emit('notification', { event, at: new Date().toISOString(), ...payload });
};

/** Push to roles (admin & director always included). */
export const notify = (roles: Role[], event: RealtimeEvent, payload: Payload) =>
  send([...new Set<Role>([...roles, 'admin', 'director'])].map((r) => `role:${r}`), event, payload);

/** Push to specific users (e.g. the technician a job was assigned to). */
export const notifyUsers = (userIds: number[], event: RealtimeEvent, payload: Payload) =>
  send(userIds.map((id) => `user:${id}`), event, payload);
