import { idOf, str, wrap } from '../../lib/http';
import { catalogService } from './catalog.service';

export const catalogController = {
  products: wrap(async (req, res) => res.json(await catalogService.products(str(req.query.category), str(req.query.q)))),
  createProduct: wrap(async (req, res) => res.status(201).json(await catalogService.createProduct(req.body))),
  updateProduct: wrap(async (req, res) => res.json(await catalogService.updateProduct(idOf(req), req.body))),
  packages: wrap(async (req, res) => res.json(await catalogService.packages(str(req.query.kind)))),
  createPackage: wrap(async (req, res) => res.status(201).json(await catalogService.createPackage(req.body))),
  removePackage: wrap(async (req, res) => {
    await catalogService.removePackage(idOf(req));
    res.status(204).end();
  }),
  removeProduct: wrap(async (req, res) => res.json(await catalogService.removeProduct(idOf(req)))),
  updatePackage: wrap(async (req, res) => res.json(await catalogService.updatePackage(idOf(req), req.body))),
};
