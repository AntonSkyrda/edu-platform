import { ApiProperty } from '@nestjs/swagger';
import {
  type CurrentUser,
  type Permission,
  PERMISSIONS,
} from '@project/contracts';

import { AuthUserDto } from './auth-response.dto';
export class CurrentUserDto extends AuthUserDto implements CurrentUser {
  @ApiProperty({ enum: PERMISSIONS, isArray: true })
  permissions!: Permission[];
}
