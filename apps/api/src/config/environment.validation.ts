import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

import { NodeEnvironment } from './environment.types';

class EnvironmentVariables {
  @IsString()
  @MinLength(32)
  PASSWORD_RESET_TOKEN_SECRET!: string;

  @IsInt()
  @Min(60)
  @Max(86400)
  PASSWORD_RESET_TTL_SECONDS: number = 1800;

  @IsInt()
  @Min(1)
  @Max(3600)
  PASSWORD_RESET_COOLDOWN_SECONDS: number = 60;

  @IsInt()
  @Min(1)
  @Max(3600)
  PASSWORD_RESET_DELIVERY_POLL_SECONDS: number = 30;

  @IsInt()
  @Min(0)
  @Max(5000)
  PASSWORD_RESET_RESPONSE_MIN_MS: number = 200;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL: string = 'info';

  @IsInt()
  @Min(1)
  @Max(3600)
  INVITATION_DELIVERY_POLL_SECONDS: number = 30;

  @IsString()
  @MinLength(32)
  INVITATION_TOKEN_SECRET!: string;

  @IsInt()
  @Min(1)
  @Max(86400)
  ACCESS_TOKEN_TTL_SECONDS: number = 900;

  @IsInt()
  @Min(1)
  @Max(31536000)
  SESSION_TTL_SECONDS: number = 2592000;

  @IsInt()
  @Min(1)
  @Max(2592000)
  INVITATION_TTL_SECONDS: number = 172800;

  @IsString()
  @IsNotEmpty()
  JWT_ISSUER: string = 'edu-platform';

  @IsString()
  @IsNotEmpty()
  JWT_AUDIENCE: string = 'edu-platform-api';

  @IsString()
  @MinLength(32)
  ACCESS_JWT_SECRET!: string;

  @IsUrl({
    require_tld: false,
    protocols: ['http', 'https'],
    require_protocol: true,
  })
  FRONTEND_ORIGIN!: string;

  @IsEnum(NodeEnvironment)
  NODE_ENV!: NodeEnvironment;

  @IsInt()
  @Min(1)
  @Max(65535)
  APP_PORT!: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_USER!: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_DB!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  POSTGRES_PORT!: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_HOST!: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_SCHEMA!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  REDIS_PORT!: number;

  @IsString()
  @IsNotEmpty()
  SMTP_HOST!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT!: number;

  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const value = obj[key];
    return value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value;
  })
  @IsBoolean()
  SMTP_SECURE!: boolean;

  @IsString()
  @IsNotEmpty()
  SMTP_USER!: string;

  @IsString()
  @IsNotEmpty()
  SMTP_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  SMTP_FROM!: string;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const environment = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(environment, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return environment;
}
