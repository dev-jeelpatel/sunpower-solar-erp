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
};
