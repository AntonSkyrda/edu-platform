import { ApiProperty } from '@nestjs/swagger';
import {
  INVITABLE_ROLES,
  type InvitableRole,
  type InviteUserRequest,
} from '@project/contracts';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, MaxLength } from 'class-validator';
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class InviteUserDto implements InviteUserRequest {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  @ApiProperty({ format: 'email', maxLength: 254, example: 'user@example.com' })
  email!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  @ApiProperty({ minLength: 1, maxLength: 100, example: 'Anton' })
  firstName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  @ApiProperty({ minLength: 1, maxLength: 100, example: 'Skyrda' })
  lastName!: string;

  @IsIn(INVITABLE_ROLES)
  @ApiProperty({ enum: INVITABLE_ROLES, example: 'STUDENT' })
  role!: InvitableRole;
}
