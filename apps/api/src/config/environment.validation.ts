import { IsEnum, IsInt, Max, Min, validateSync } from 'class-validator';
import { NodeEnvironment } from './environment.types';
import { plainToInstance } from 'class-transformer';

class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;

  @IsInt()
  @Min(1)
  @Max(65535)
  APP_PORT: number;
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
