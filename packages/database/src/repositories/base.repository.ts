import {
  asc,
  eq,
  type InferInsertModel,
  type InferSelectModel,
} from 'drizzle-orm';
import type {
  PgInsertValue,
  PgTable,
  PgUpdateSetSource,
} from 'drizzle-orm/pg-core';

import type { Database } from '../client';
import type {
  DatabaseExecutor,
  FindManyOptions,
  RepositoryTable,
  Transaction,
  UpdateData,
} from './repository.types';

export abstract class BaseRepository<TTable extends RepositoryTable> {
  protected constructor(
    protected readonly database: Database,
    protected readonly table: TTable,
  ) {}

  protected executor(transaction?: Transaction): DatabaseExecutor {
    return transaction ?? this.database;
  }

  async findById(
    id: string,
    transaction?: Transaction,
  ): Promise<InferSelectModel<TTable> | null> {
    const rows = await this.executor(transaction)
      .select()
      .from(this.table as PgTable)
      .where(eq(this.table.id, id))
      .limit(1);
    return (rows as unknown as InferSelectModel<TTable>[])[0] ?? null;
  }

  async findMany(
    options: FindManyOptions = {},
    transaction?: Transaction,
  ): Promise<InferSelectModel<TTable>[]> {
    const { where, limit = 50, offset = 0 } = options;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0
    ) {
      throw new RangeError(
        'limit must be between 1 and 100; offset must be a non-negative integer',
      );
    }
    const rows = await this.executor(transaction)
      .select()
      .from(this.table as PgTable)
      .where(where)
      .orderBy(asc(this.table.createdAt), asc(this.table.id))
      .limit(limit)
      .offset(offset);
    return rows as InferSelectModel<TTable>[];
  }

  async create(
    data: InferInsertModel<TTable>,
    transaction?: Transaction,
  ): Promise<InferSelectModel<TTable>> {
    const rows = await this.executor(transaction)
      .insert(this.table)
      .values(data as PgInsertValue<TTable>)
      .returning();
    return rows[0] as InferSelectModel<TTable>;
  }

  async update(
    id: string,
    data: UpdateData<TTable>,
    transaction?: Transaction,
  ): Promise<InferSelectModel<TTable> | null> {
    const values = Object.fromEntries(
      Object.entries(data).filter(
        ([key, value]) =>
          !['id', 'createdAt', 'updatedAt'].includes(key) &&
          value !== undefined,
      ),
    );
    if (Object.keys(values).length === 0)
      throw new TypeError(
        'Update data must contain at least one writable field',
      );
    const rows = await this.executor(transaction)
      .update(this.table)
      .set(values as PgUpdateSetSource<TTable>)
      .where(eq(this.table.id, id))
      .returning();
    return (rows as unknown as InferSelectModel<TTable>[])[0] ?? null;
  }

  async delete(id: string, transaction?: Transaction): Promise<boolean> {
    const rows = await this.executor(transaction)
      .delete(this.table)
      .where(eq(this.table.id, id))
      .returning({ id: this.table.id });
    return rows.length > 0;
  }
}
