import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AuthUser, UsersPage } from '@project/contracts';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import { AuthUserDto } from './auth-response.dto';
export class ListUsersDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  limit = 20;
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 1000000 })
  offset = 0;
}
export class UsersPageDto implements UsersPage {
  @ApiProperty({ type: [AuthUserDto] }) items!: AuthUser[];
  @ApiProperty() hasMore!: boolean;
}
