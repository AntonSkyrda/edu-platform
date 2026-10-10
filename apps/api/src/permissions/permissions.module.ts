import { Module } from '@nestjs/common';

import { PermissionsGuard } from '../common/guards/permissions.guard';
import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { PermissionsRepository } from './permissions.repository';
import { PermissionsService } from './permissions.service';
@Module({
  imports: [DatabaseModule, UsersModule],
  providers: [PermissionsRepository, PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
