import { ApiProperty } from '@nestjs/swagger';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@project/contracts';
import type { AcceptInvitationRequest } from '@project/contracts';
import { IsString, Length, Matches } from 'class-validator';

export class AcceptInvitationDto implements AcceptInvitationRequest {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  @ApiProperty({
    pattern: '^[a-f0-9]{64}$',
    description: 'Single-use token from the invitation email fragment',
    writeOnly: true,
  })
  token!: string;

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
