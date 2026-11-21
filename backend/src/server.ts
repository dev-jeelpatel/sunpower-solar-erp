import http from 'node:http';
import { app } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { initSocket } from './realtime/socket';

const server = http.createServer(app);
initSocket(server);
server.listen(env.port, () => console.log(`SunPower API listening on http://localhost:${env.port} (docs: /api/docs)`));

const shutdown = () => server.close(() => prisma.$disconnect().then(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
