import { prisma } from '../../lib/prisma';

export const authRepository = {
  /** Case-insensitive lookup (emails are stored lower-cased and uniquely indexed on lower(email)). */
  findActiveByEmail: (email: string) =>
    prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, active: true } }),

  findActiveById: (id: number) =>
    prisma.user.findFirst({
      where: { id, active: true },
      select: { id: true, name: true, email: true, role: true, phone: true },
    }),
};
