import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Transaction, UpdateData } from '@project/database';
import type { users } from '@project/database/schema';
import type { NewUser, User } from '@project/database/types';

import type { GetUserOptions } from './interfaces/get-user-options.interface';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  findByEmail(email: string, transaction?: Transaction): Promise<User | null> {
    return this.repository.findByEmail(email, transaction);
  }

  async getByIdOrThrow(
    id: string,
    options: GetUserOptions = {},
  ): Promise<User> {
    if (options.lock === 'update' && !options.transaction)
      throw new TypeError('A transaction is required for row locking');
    const user =
      options.lock === 'update'
        ? await this.repository.findByIdForUpdate(id, options.transaction)
        : await this.repository.findById(id, options.transaction);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: NewUser, transaction?: Transaction): Promise<User> {
    try {
      return await this.repository.create(
        { ...data, email: data.email.trim().toLowerCase() },
        transaction,
      );
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async update(
    id: string,
    data: UpdateData<typeof users>,
    transaction?: Transaction,
  ): Promise<User> {
    try {
      const updated = await this.repository.update(
        id,
        {
          ...data,
          ...(data.email === undefined
            ? {}
            : { email: data.email.trim().toLowerCase() }),
        },
        transaction,
      );
      if (!updated) throw new NotFoundException('User not found');
      return updated;
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  private handleWriteError(error: unknown): never {
    const cause = (error as { cause?: { code?: string; constraint?: string } })
      .cause;
    if (cause?.code === '23505' && cause.constraint === 'users_email_unique')
      throw new ConflictException('User with this email already exists');
    throw error;
  }
}
