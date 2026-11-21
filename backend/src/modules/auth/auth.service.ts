import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { unauthorized } from '../../lib/errors';
import { authRepository } from './auth.repository';
import type { LoginInput } from './auth.schema';

export const authService = {
  async login({ email, password }: LoginInput) {
    const user = await authRepository.findActiveByEmail(email);
    // Same message for unknown email / wrong password: do not leak which one failed
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw unauthorized('Incorrect email or password');
    const token = jwt.sign({ sub: user.id, role: user.role, name: user.name }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    });
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  },

  async me(id: number) {
    const user = await authRepository.findActiveById(id);
    if (!user) throw unauthorized();
    return user;
  },
};
