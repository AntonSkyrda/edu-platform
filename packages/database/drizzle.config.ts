import { resolve } from 'node:path';

import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

import { createDatabaseUrl } from './src/connection';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const port = Number(required('POSTGRES_PORT'));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid POSTGRES_PORT');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: createDatabaseUrl({
      host: required('POSTGRES_HOST'),
      port,
      user: required('POSTGRES_USER'),
      password: required('POSTGRES_PASSWORD'),
      database: required('POSTGRES_DB'),
      schema: required('POSTGRES_SCHEMA'),
    }),
  },
  strict: true,
});
