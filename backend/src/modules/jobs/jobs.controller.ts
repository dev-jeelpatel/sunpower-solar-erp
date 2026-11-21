import { idOf, str, wrap } from '../../lib/http';
import { jobsService } from './jobs.service';

export const jobsController = {
  list: wrap(async (req, res) => res.json(await jobsService.list(req.user, str(req.query.status)))),
  get: wrap(async (req, res) => res.json(await jobsService.get(idOf(req), req.user))),

  /** Runs before multer so a rejected request never writes files to disk. */
  guardPhotos: wrap(async (req, _res, next) => {
    await jobsService.assertOpenForPhotos(idOf(req), req.user);
    next();
  }),
  addPhotos: wrap(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    res.status(201).json(await jobsService.addPhotos(idOf(req), files, req.body?.caption, req.user.id));
  }),
  removePhoto: wrap(async (req, res) => {
    await jobsService.removePhoto(idOf(req), Number(req.params.photoId), req.user);
    res.status(204).end();
  }),
  complete: wrap(async (req, res) => res.json(await jobsService.complete(idOf(req), req.body, req.user))),
};
