import { Injectable } from '@nestjs/common';
import { BaseRepository, eq, sql, type Transaction } from '@project/database';
import { users } from '@project/database/schema';
import type { User } from '@project/database/types';

import { DatabaseService } from '../database/database.service';

@Injectable()
export class UsersRepository extends BaseRepository<typeof users> {
  constructor(database: DatabaseService) {
    super(database.db, users);
  }

  async findByEmail(
    email: string,
    transaction?: Transaction,
  ): Promise<User | null> {
    const [user] = await this.executor(transaction)
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
      .limit(1);
    return user ?? null;
  }

  async findByIdForUpdate(
    id: string,
    transaction: Transaction,
  ): Promise<User | null> {
    const [user] = await transaction
      .select()
      .from(users)
      .where(eq(users.id, id))
      .for('update');
    return user ?? null;
  }
}
