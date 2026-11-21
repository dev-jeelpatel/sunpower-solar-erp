import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// Never expose passwordHash
const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  hourlyRate: true,
  active: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const toApi = (u: Prisma.UserGetPayload<{ select: typeof publicSelect }>) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone,
  hourly_rate: Number(u.hourlyRate),
  active: u.active,
  created_at: u.createdAt,
});

export const usersRepository = {
  async listActive(role: string | null) {
    const rows = await prisma.user.findMany({
      where: { active: true, ...(role ? { role: role as UserRole } : {}) },
      select: publicSelect,
      orderBy: { name: 'asc' },
    });
    return rows.map(toApi);
  },

  async listAll() {
    const rows = await prisma.user.findMany({ select: publicSelect, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    return rows.map(toApi);
  },

  async create(data: { name: string; email: string; passwordHash: string; role: UserRole; phone?: string; hourlyRate: number }) {
    return toApi(await prisma.user.create({ data: { ...data, phone: data.phone ?? null }, select: publicSelect }));
  },

  async update(id: number, data: Prisma.UserUpdateInput) {
    try {
      return toApi(await prisma.user.update({ where: { id }, data, select: publicSelect }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
      throw e;
    }
  },
};
