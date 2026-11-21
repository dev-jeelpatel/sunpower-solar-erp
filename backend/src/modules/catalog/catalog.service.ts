import { conflict, notFound, unprocessable } from '../../lib/errors';
import { tx } from '../../lib/prisma';
import { catalogRepository as repo } from './catalog.repository';
import type { PackageInput, ProductInput } from './catalog.schema';

const isDuplicate = (e: unknown) => e instanceof Error && /unique|duplicate|products_sku/i.test(e.message);
const dupSku = () => conflict('A product with this SKU already exists', { sku: 'SKU already in use' });

export const catalogService = {
  products: repo.products,

  async createProduct(p: ProductInput) {
    try {
      return await repo.insertProduct(p);
    } catch (e) {
      throw isDuplicate(e) ? dupSku() : e;
    }
  },

  async updateProduct(id: number, p: ProductInput) {
    let row;
    try {
      row = await repo.updateProduct(id, p);
    } catch (e) {
      throw isDuplicate(e) ? dupSku() : e;
    }
    if (!row) throw notFound('Product');
    return row;
  },

  packages: repo.packages,

  createPackage: (p: PackageInput) =>
    tx(async (db) => {
      const pkg = await repo.insertPackage(db, p);
      for (const it of p.items) await repo.upsertPackageItem(db, pkg!.id, it.productId, it.quantity);
      return pkg;
    }),

  async removePackage(id: number) {
    if (!(await repo.deactivatePackage(id))) throw notFound('Package');
  },

  /** Delete a product that was never used; hide one that has history (so old quotes and invoices stay intact). */
  async removeProduct(id: number) {
    if (!(await repo.productExists(id))) throw notFound('Product');
    const use = await repo.productUse(id);
    if (use?.in_packages) throw unprocessable(`This product is part of: ${use.in_packages}. Remove it from those packages first`);
    if (use?.has_history) {
      await repo.hideProduct(id);
      return { deleted: false, hidden: true };
    }
    await repo.deleteProduct(id);
    return { deleted: true, hidden: false };
  },

  updatePackage: (id: number, p: PackageInput) =>
    tx(async (db) => {
      const pkg = await repo.updatePackage(db, id, p);
      if (!pkg) throw notFound('Package');
      await repo.clearPackageItems(db, id);
      for (const it of p.items) await repo.upsertPackageItem(db, id, it.productId, it.quantity);
      return pkg;
    }),
};
