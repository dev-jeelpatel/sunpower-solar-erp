import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import type { CreateUserInput, UpdateUserInput } from './users.schema';
import { usersRepository } from './users.repository';

const dupEmail = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? conflict('Another staff member already uses this email', { email: 'Email already in use' }) : e;

export const usersService = {
  listActive: (role: string | null) => usersRepository.listActive(role),
  listAll: () => usersRepository.listAll(),

  async create({ password, ...rest }: CreateUserInput) {
    try {
      return await usersRepository.create({ ...rest, passwordHash: await bcrypt.hash(password, 10) });
    } catch (e) {
      throw dupEmail(e);
    }
  },

  /** Edit a staff member. Guards: you cannot demote or disable yourself, and the last active admin must stay. */
  async update(id: number, { password, hourlyRate, ...rest }: UpdateUserInput, actorId: number) {
    const cur = await usersRepository.findById(id);
    if (!cur) throw notFound('User');
    const losesAdmin = cur.role === 'admin' && cur.active && ((rest.role && rest.role !== 'admin') || rest.active === false);
    if (id === actorId && losesAdmin) throw unprocessable('You cannot remove your own admin access. Ask another admin to do it', { role: 'Not allowed for your own account' });
    if (id === actorId && rest.active === false) throw unprocessable('You cannot disable your own account');
    if (losesAdmin && (await usersRepository.activeAdminsExcept(id)) === 0) throw unprocessable('At least one active admin must remain');
    try {
      const user = await usersRepository.update(id, {
        ...rest,
        ...(hourlyRate !== undefined ? { hourlyRate } : {}),
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      });
      if (!user) throw notFound('User');
      return user;
    } catch (e) {
      throw dupEmail(e);
    }
  },

  /** Delete only a member with no history. Anyone who has worked in the system is disabled instead, so records keep their names. */
  async remove(id: number, actorId: number) {
    if (id === actorId) throw unprocessable('You cannot delete your own account');
    const cur = await usersRepository.findById(id);
    if (!cur) throw notFound('User');
    if (cur.role === 'admin' && cur.active && (await usersRepository.activeAdminsExcept(id)) === 0) throw unprocessable('At least one active admin must remain');
    try {
      await usersRepository.remove(id);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003')
        throw unprocessable('This person appears in existing records (enquiries, jobs, payments...), so they cannot be deleted. Disable the account instead');
      throw e;
    }
  },
};
