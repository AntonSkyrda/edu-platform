import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

import { NodeEnvironment } from './environment.types';

class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;

  @IsInt()
  @Min(1)
  @Max(65535)
  APP_PORT: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_USER: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_DB: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  POSTGRES_PORT: number;

  @IsString()
  @IsNotEmpty()
  POSTGRES_HOST: string;

  @IsString()
  @IsNotEmpty()
  POSTGRES_SCHEMA: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  REDIS_PORT: number;

  @IsString()
  @IsNotEmpty()
  SMTP_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT: number;

  @IsBoolean()
  SMTP_SECURE: boolean;

  @IsString()
  @IsNotEmpty()
  SMTP_USER: string;

  @IsString()
  @IsNotEmpty()
  SMTP_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  SMTP_FROM: string;
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
