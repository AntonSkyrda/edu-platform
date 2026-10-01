export interface DatabaseConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  schema: string;
}

export function createDatabaseUrl(options: DatabaseConnectionOptions): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(options.schema)) {
    throw new Error('Invalid PostgreSQL schema name');
  }

  const url = new URL('postgresql://localhost');
  url.hostname = options.host;
  url.port = String(options.port);
  url.username = encodeURIComponent(options.user);
  url.password = encodeURIComponent(options.password);
  url.pathname = `/${encodeURIComponent(options.database)}`;
  url.searchParams.set('options', `-c search_path=${options.schema}`);
  return url.toString();
}
