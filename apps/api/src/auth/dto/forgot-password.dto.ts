import { ApiProperty } from '@nestjs/swagger';
import type { ForgotPasswordRequest } from '@project/contracts';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class ForgotPasswordDto implements ForgotPasswordRequest {
  @ApiProperty({ format: 'email', maxLength: 254, example: 'user@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
