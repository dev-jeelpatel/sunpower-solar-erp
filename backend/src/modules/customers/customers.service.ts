import { conflict, notFound, unprocessable } from '../../lib/errors';
import { customersRepository as repo } from './customers.repository';
import type { CustomerInput } from './customers.schema';

const dupPhone = (e: unknown) => e instanceof Error && /unique|duplicate/i.test(e.message);
const phoneTaken = () => conflict('A customer with this mobile number already exists', { phone: 'Number already in use' });

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

  async create(c: CustomerInput) {
    try {
      return await repo.insert(c);
    } catch (e) {
      throw dupPhone(e) ? phoneTaken() : e;
    }
  },

  async update(id: number, c: CustomerInput) {
    let row;
    try {
      row = await repo.update(id, c);
    } catch (e) {
      throw dupPhone(e) ? phoneTaken() : e;
    }
    if (!row) throw notFound('Customer');
    return row;
  },

  /** Only a customer with no history can be deleted. */
  async remove(id: number) {
    const l = await repo.links(id);
    const used = l && Object.entries(l).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
    if (used?.length) throw unprocessable(`This customer has ${used.join(', ')}, so it cannot be deleted. Edit the details instead`);
    if (!(await repo.remove(id))) throw notFound('Customer');
  },
};
