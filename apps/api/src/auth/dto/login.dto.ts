import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@project/contracts';
import type { LoginRequest } from '@project/contracts';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LoginDto implements LoginRequest {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  @ApiProperty({ format: 'email', maxLength: 254, example: 'user@example.com' })
  email!: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)
  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    format: 'password',
    writeOnly: true,
  })
  password!: string;
}
