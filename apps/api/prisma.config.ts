import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: '../../.env' });

const postgresUser = encodeURIComponent(process.env['POSTGRES_USER'] ?? '');
const postgresPassword = encodeURIComponent(
  process.env['POSTGRES_PASSWORD'] ?? '',
);
const postgresHost = process.env['POSTGRES_HOST'] ?? '';
const postgresPort = process.env['POSTGRES_PORT'] ?? '';
const postgresDatabase = encodeURIComponent(process.env['POSTGRES_DB'] ?? '');
const postgresSchema = encodeURIComponent(process.env['POSTGRES_SCHEMA'] ?? '');

const databaseUrl =
  `postgresql://${postgresUser}:${postgresPassword}` +
  `@${postgresHost}:${postgresPort}` +
  `/${postgresDatabase}?schema=${postgresSchema}`;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
