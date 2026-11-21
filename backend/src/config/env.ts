import 'dotenv/config';
import path from 'node:path';

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/sunpower',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? path.join(__dirname, '..', '..', 'uploads')),
  // Business rules
  advancePercent: Number(process.env.ADVANCE_PERCENT) || 30, // % of order total that confirms an order
  gstPercent: Number(process.env.GST_PERCENT) || 5,
  quoteValidDays: 15,
  isProd,
};

if (isProd && env.jwtSecret === 'dev-only-secret-change-me') throw new Error('JWT_SECRET must be set in production');
