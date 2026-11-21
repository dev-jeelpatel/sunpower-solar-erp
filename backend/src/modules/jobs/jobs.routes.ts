import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { idParam } from '../../lib/zod';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { jobsController as c } from './jobs.controller';
import { completeJobSchema } from './jobs.schema';

// Photo upload: images only, 5 MB each
const ALLOWED: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) =>
    ALLOWED[file.mimetype]
      ? cb(null, true)
      : cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only JPG, PNG or WebP photos are allowed')),
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(env.uploadDir, 'jobs', String(req.params.id));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    // Random name: never trust the client-supplied file name
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ALLOWED[file.mimetype]}`),
  }),
});

export const jobsRouter = Router();
jobsRouter.use(authenticate);
jobsRouter.get('/', c.list);
jobsRouter.get('/:id', validate(idParam, 'params'), c.get);
jobsRouter.post('/:id/photos', authorize('technician'), validate(idParam, 'params'), c.guardPhotos, upload.array('photos', 6), c.addPhotos);
jobsRouter.delete('/:id/photos/:photoId', authorize('technician'), validate(idParam, 'params'), c.removePhoto);
jobsRouter.post('/:id/complete', authorize('technician'), validate(idParam, 'params'), validate(completeJobSchema), c.complete);
