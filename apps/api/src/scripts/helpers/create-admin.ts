import { ConflictException } from '@nestjs/common';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@project/contracts';
import { isEmail } from 'class-validator';

import type { PasswordService } from '../../common/security/password.service';
import type { UsersService } from '../../users/users.service';

export interface CreateAdminInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

export async function createAdmin(
  users: UsersService,
  input: CreateAdminInput,
  passwords: PasswordService,
) {
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!isEmail(email) || email.length > 254)
    throw new Error('A valid email is required (maximum 254 characters).');
  if (
    ![firstName, lastName].every(
      (name) => name.length >= 1 && name.length <= 100,
    )
  )
    throw new Error('First and last names must contain 1–100 characters.');
  if (
    [...input.password].length < PASSWORD_MIN_LENGTH ||
    [...input.password].length > PASSWORD_MAX_LENGTH
  )
    throw new Error(
      `Password must contain ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters.`,
    );
  if (await users.findByEmail(email))
    throw new ConflictException('User with this email already exists');
  const passwordHash = await passwords.hash(input.password);
  const user = await users.create({
    email,
    firstName,
    lastName,
    passwordHash,
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  return { id: user.id, email: user.email };
}
