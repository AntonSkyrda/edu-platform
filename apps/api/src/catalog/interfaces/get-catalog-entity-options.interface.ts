import type { Transaction } from '@project/database';
export interface GetCatalogEntityOptions {
  transaction?: Transaction;
  lock?: 'update';
}
