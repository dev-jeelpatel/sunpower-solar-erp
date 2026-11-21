import { idOf, str, wrap } from '../../lib/http';
import { dispatchService } from './dispatch.service';

export const dispatchController = {
  list: wrap(async (req, res) => res.json(await dispatchService.list(str(req.query.status)))),
  get: wrap(async (req, res) => res.json(await dispatchService.get(idOf(req)))),
  scan: wrap(async (req, res) => res.json(await dispatchService.scan(idOf(req), req.body.serial, req.user.id))),
  unscan: wrap(async (req, res) => res.json(await dispatchService.unscan(idOf(req), String(req.params.serial), req.user.id))),
  dispatch: wrap(async (req, res) => res.json(await dispatchService.dispatch(idOf(req), req.body.vehicleNo, req.user.id))),
  deliver: wrap(async (req, res) => res.json(await dispatchService.deliver(idOf(req), req.user.id))),
};
