import { notFound } from '../../lib/errors';
import { customersRepository as repo } from './customers.repository';

export const customersService = {
  list: (search: string | null, limit: number, offset: number) => repo.list(search, limit, offset),

  async get(id: number) {
    const customer = await repo.findById(id);
    if (!customer) throw notFound('Customer');
    const [orders, units, tickets] = await Promise.all([repo.ordersOf(id), repo.unitsOf(id), repo.ticketsOf(id)]);
    return { ...customer, orders, units, tickets };
  },

  /** One search box for support: serial number, phone or name. */
  async search(raw: string) {
    const term = raw.trim();
    if (term.length < 3) return { units: [], customers: [] };
    const [units, customers] = await Promise.all([repo.searchUnits(term), repo.searchCustomers(term)]);
    return { units, customers };
  },
};
