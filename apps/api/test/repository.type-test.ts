import type { Transaction } from '@project/database';
import type { User } from '@project/database/types';

import type { UsersRepository } from '../src/users/users.repository';
import type { UsersService } from '../src/users/users.service';

// Compiled with --noEmit; never executed against a database.
export function checkRepositoryTypes(repository: UsersRepository) {
  const result: Promise<User | null> = repository.findById('id');
  void result;
  void repository.create({
    email: 'test@example.test',
    firstName: 'Test',
    lastName: 'User',
    role: 'STUDENT',
  });
  void repository.update('id', { passwordHash: null, status: 'ACTIVE' });
  // @ts-expect-error Role is required when creating a user.
  void repository.create({
    email: 'test@example.test',
    firstName: 'Test',
    lastName: 'User',
  });
  // @ts-expect-error Role must be one of the schema enum values.
  void repository.update('id', { role: 'OWNER' });
  // @ts-expect-error Primary keys cannot be updated.
  void repository.update('id', { id: 'another-id' });
  // @ts-expect-error Creation timestamps are managed by the repository.
  void repository.update('id', { createdAt: new Date() });
  // @ts-expect-error Update timestamps are managed by Drizzle.
  void repository.update('id', { updatedAt: new Date() });
}

export function checkUserReadOptions(
  service: UsersService,
  transaction: Transaction,
) {
  void service.getByIdOrThrow('id');
  void service.getByIdOrThrow('id', { transaction });
  void service.getByIdOrThrow('id', { transaction, lock: 'update' });
  // @ts-expect-error Locking requires an explicit transaction.
  void service.getByIdOrThrow('id', { lock: 'update' });
}
