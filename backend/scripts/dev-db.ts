// Convenience for machines without PostgreSQL installed: starts a real local PostgreSQL
// server (binaries come from the `embedded-postgres` dev dependency). Data lives in backend/.pgdata.
// Keep this running in its own terminal, then run `npm run db:setup` once and `npm run dev`.
// For production or team use, point DATABASE_URL at a normal PostgreSQL server instead.
import fs from 'node:fs';
import path from 'node:path';
// The package ships ESM-style types that this CommonJS setup cannot resolve, so it is loaded with require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EmbeddedPostgres = require('embedded-postgres').default;

const dataDir = path.join(__dirname, '..', '.pgdata');
const port = Number(process.env.PGPORT) || 5433;
const dbName = process.env.PGDATABASE || 'sunpower_ts';

async function main() {
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: true });
  const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase(dbName);
  console.log(`PostgreSQL ready: postgres://postgres:postgres@localhost:${port}/${dbName}`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
