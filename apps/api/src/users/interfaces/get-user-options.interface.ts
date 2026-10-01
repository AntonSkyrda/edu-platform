import type { Transaction } from '@project/database';

export type GetUserOptions =
  | { transaction?: Transaction; lock?: never }
  | { transaction: Transaction; lock: 'update' };
