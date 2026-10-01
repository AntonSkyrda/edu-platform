import { ApiProperty } from '@nestjs/swagger';
import {
  type AuthResponse,
  type AuthUser,
  USER_ROLES,
  type UserRole,
  type UserStatus,
} from '@project/contracts';

export class AuthUserDto implements AuthUser {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'email', example: 'user@example.com' })
  email!: string;
  @ApiProperty({ example: 'Anton' })
  firstName!: string;
  @ApiProperty({ example: 'Skyrda' })
  lastName!: string;
  @ApiProperty({ enum: USER_ROLES })
  role!: UserRole;
  @ApiProperty({ enum: ['INVITED', 'ACTIVE', 'BLOCKED'] })
  status!: UserStatus;
}

export class AuthResponseDto implements AuthResponse {
  @ApiProperty({
    example: 900,
    description: 'Access cookie lifetime in seconds',
  })
  expiresIn!: number;
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUser;
}

export class AuthMessageDto {
  @ApiProperty({ example: 'Signed out' })
  message!: string;
}
