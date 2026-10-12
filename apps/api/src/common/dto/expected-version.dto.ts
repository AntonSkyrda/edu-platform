import { ApiProperty } from '@nestjs/swagger';
import type { VersionedRequest } from '@project/contracts';
import { IsInt, Max, Min } from 'class-validator';

export class ExpectedVersionDto implements VersionedRequest {
  @ApiProperty({
    minimum: 1,
    maximum: 2147483647,
    description: 'Version read by the editor',
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion!: number;
}
