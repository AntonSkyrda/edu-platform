import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema';

export function createDatabase(config: PoolConfig) {
  const pool = new Pool({ connectionTimeoutMillis: 5_000, ...config });
  const db = drizzle({ client: pool, schema });

  return { db, pool };
}

export type Database = ReturnType<typeof createDatabase>['db'];
