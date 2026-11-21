import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env';
import { forbidden, notFound, unprocessable } from '../../lib/errors';
import type { AuthUser } from '../../lib/http';
import { type Db, logActivity, prisma, tx } from '../../lib/prisma';
import { jobsRepository as repo } from './jobs.repository';
import type { CompleteJobInput } from './jobs.schema';

const MAX_PHOTOS = 20;

export const jobsService = {
  /** Technicians only see jobs where they are crew. */
  list: (user: AuthUser, status: string | null) => repo.list(user.role === 'technician' ? user.id : null, status),

  /** Technicians may only touch jobs they are crew on. */
  async load(id: number, user: AuthUser, db: Db = prisma, lock = false) {
    const job = await repo.find(db, id, lock);
    if (!job) throw notFound('Job');
    if (user.role === 'technician' && !(await repo.isCrew(db, id, user.id))) throw forbidden('This job is not assigned to you');
    return job;
  },

  async get(id: number, user: AuthUser) {
    const job = await this.load(id, user);
    const [ctx, photos, crew, units, labour] = await Promise.all([
      repo.orderContext(job.order_id), repo.photos(id), repo.crew(id), repo.units(job.order_id), repo.labour(id),
    ]);
    return { ...job, ...ctx, photos: photos.map((p) => ({ ...p, url: `/uploads/${p.file_path}` })), crew, units, labour };
  },

  /** Used before the upload middleware runs, so rejected requests never touch the disk. */
  async assertOpenForPhotos(id: number, user: AuthUser) {
    const job = await this.load(id, user);
    if (job.status === 'completed') throw unprocessable('This job is already signed off');
  },

  async addPhotos(id: number, files: { filename: string }[], caption: unknown, userId: number) {
    if (!files.length) throw unprocessable('Choose at least one photo', { photos: 'No photo selected' });
    if ((await repo.photoCount(prisma, id)) + files.length > MAX_PHOTOS) throw unprocessable(`A job can have at most ${MAX_PHOTOS} photos`);
    const text = String(caption ?? '').slice(0, 150) || null;
    for (const f of files) await repo.addPhoto(id, `jobs/${id}/${f.filename}`, text, userId);
    return { uploaded: files.length };
  },

  async removePhoto(id: number, photoId: number, user: AuthUser) {
    await this.assertOpenForPhotos(id, user);
    const photo = await repo.deletePhoto(photoId, id);
    if (!photo) throw notFound('Photo');
    fs.rm(path.join(env.uploadDir, photo.file_path), { force: true }, () => undefined);
  },

  /** Technician completion form: signed off by the customer on a tablet. */
  async complete(id: number, d: CompleteJobInput, user: AuthUser) {
    await tx(async (db) => {
      const job = await this.load(id, user, db, true);
      if (job.status === 'completed') throw unprocessable('This job is already signed off');
      const start = new Date(d.startedAt);
      const end = new Date(d.finishedAt);
      if (end <= start) throw unprocessable('Finish time must be after the start time', { finishedAt: 'Must be after the start time' });
      if (end.getTime() > Date.now() + 5 * 60000) throw unprocessable('Finish time cannot be in the future', { finishedAt: 'Cannot be in the future' });
      if (end.getTime() - start.getTime() > 24 * 3600 * 1000)
        throw unprocessable('A single job cannot run longer than 24 hours', { finishedAt: 'Duration over 24 hours' });

      const ctx = await repo.completionContext(db, job.order_id);
      if (ctx?.dispatch_status !== 'delivered') throw unprocessable('Materials have not been marked delivered yet');
      if ((await repo.photoCount(db, job.id)) < 1)
        throw unprocessable('Upload at least one photo of the finished installation', { photos: 'At least one photo is required' });
      if (ctx.capacity_kw && Number(ctx.capacity_kw) !== d.confirmedKw && !d.notes)
        throw unprocessable(`Installed size differs from the ordered ${ctx.capacity_kw} kW. Explain why in the notes.`, {
          notes: 'Required when the size differs from the order',
        });

      await repo.complete(db, job.id, d, start, end);
      await repo.completeOrder(db, job.order_id);
      await logActivity(db, 'order', job.order_id, 'installation_signed_off', user.id, { confirmedKw: d.confirmedKw });
    });
    return { ok: true };
  },
};
