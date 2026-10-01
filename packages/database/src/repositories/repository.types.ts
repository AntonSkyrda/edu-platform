import type { InferSelectModel, SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { Database } from '../client';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DatabaseExecutor = Database | Transaction;
export type RepositoryTable = PgTable & {
  id: AnyPgColumn<{ data: string }>;
  createdAt: AnyPgColumn<{ data: Date }>;
  updatedAt: AnyPgColumn<{ data: Date }>;
};
export type UpdateData<TTable extends RepositoryTable> = Partial<
  Omit<InferSelectModel<TTable>, 'id' | 'createdAt' | 'updatedAt'>
>;
export interface FindManyOptions {
  where?: SQL;
  limit?: number;
  offset?: number;
}
