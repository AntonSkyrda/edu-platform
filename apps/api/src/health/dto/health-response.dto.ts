import { ApiProperty } from '@nestjs/swagger';

export type DependencyStatus = 'up' | 'down';

export class LivenessResponseDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
}

export class ReadinessResponseDto {
  @ApiProperty({ enum: ['ready', 'not_ready'] })
  status!: 'ready' | 'not_ready';

  @ApiProperty({
    type: 'object',
    required: ['postgresql', 'redis'],
    properties: {
      postgresql: { type: 'string', enum: ['up', 'down'] },
      redis: { type: 'string', enum: ['up', 'down'] },
    },
    additionalProperties: false,
  })
  checks!: { postgresql: DependencyStatus; redis: DependencyStatus };
}
