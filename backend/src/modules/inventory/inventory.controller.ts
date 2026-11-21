import { idOf, paging, str, wrap } from '../../lib/http';
import { inventoryService } from './inventory.service';

export const inventoryController = {
  stock: wrap(async (_req, res) => res.json(await inventoryService.stock())),

  units: wrap(async (req, res) => {
    const { limit, offset, page } = paging(req.query);
    const productId = req.query.productId ? Number(req.query.productId) : null;
    const r = await inventoryService.units({ q: str(req.query.q), status: str(req.query.status), productId, limit, offset });
    res.json({ ...r, page, limit });
  }),

  lookup: wrap(async (req, res) => res.json(await inventoryService.lookup(String(req.params.serial)))),

  suppliers: wrap(async (_req, res) => res.json(await inventoryService.suppliers())),
  createSupplier: wrap(async (req, res) => res.status(201).json(await inventoryService.createSupplier(req.body))),

  purchases: wrap(async (_req, res) => res.json(await inventoryService.purchases())),
  purchase: wrap(async (req, res) => res.json(await inventoryService.purchase(idOf(req)))),
  createPurchase: wrap(async (req, res) => res.status(201).json(await inventoryService.createPurchase(req.body, req.user.id))),
  receive: wrap(async (req, res) => res.json(await inventoryService.receive(idOf(req), req.body, req.user.id))),

  updateSupplier: wrap(async (req, res) => res.json(await inventoryService.updateSupplier(idOf(req), req.body))),
  removeSupplier: wrap(async (req, res) => {
    await inventoryService.removeSupplier(idOf(req));
    res.status(204).end();
  }),
  cancelPurchase: wrap(async (req, res) => res.json(await inventoryService.cancelPurchase(idOf(req), req.user.id))),
  addUnits: wrap(async (req, res) => res.status(201).json(await inventoryService.addUnits(req.body, req.user.id))),
  renameUnit: wrap(async (req, res) => res.json(await inventoryService.renameUnit(idOf(req), req.body.serial, req.user.id))),
  removeUnit: wrap(async (req, res) => res.json(await inventoryService.removeUnit(idOf(req), req.user.id))),
};
