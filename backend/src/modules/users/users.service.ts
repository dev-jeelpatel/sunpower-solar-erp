import bcrypt from 'bcryptjs';
import { notFound } from '../../lib/errors';
import type { CreateUserInput, UpdateUserInput } from './users.schema';
import { usersRepository } from './users.repository';

export const usersService = {
  listActive: (role: string | null) => usersRepository.listActive(role),
  listAll: () => usersRepository.listAll(),

  async create({ password, ...rest }: CreateUserInput) {
    return usersRepository.create({ ...rest, passwordHash: await bcrypt.hash(password, 10) });
  },

  async update(id: number, { password, hourlyRate, ...rest }: UpdateUserInput) {
    const user = await usersRepository.update(id, {
      ...rest,
      ...(hourlyRate !== undefined ? { hourlyRate } : {}),
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
    });
    if (!user) throw notFound('User');
    return user;
  },
};
