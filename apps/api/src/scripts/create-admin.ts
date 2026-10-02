import 'reflect-metadata';

import { parseArgs } from 'node:util';

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { PasswordService } from '../common/security/password.service';
import { SecurityModule } from '../common/security/security.module';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { createAdmin } from './helpers/create-admin';
import { promptPassword } from './helpers/prompt-password';

@Module({ imports: [UsersModule, SecurityModule] })
class CreateAdminModule {}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      'first-name': { type: 'string' },
      'last-name': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'pnpm admin:create --email admin@example.com --first-name Anton --last-name Skyrda',
    );
    return;
  }
  if (!values.email || !values['first-name'] || !values['last-name'])
    throw new Error(
      'Provide --email, --first-name and --last-name. Use --help for an example.',
    );
  const password = await promptPassword();
  const app = await NestFactory.createApplicationContext(CreateAdminModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const admin = await createAdmin(
      app.get(UsersService),
      {
        email: values.email,
        firstName: values['first-name'],
        lastName: values['last-name'],
        password,
      },
      app.get(PasswordService),
    );
    console.log(`Admin created: ${admin.email} (${admin.id})`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Admin creation failed.',
  );
  process.exitCode = 1;
});
