import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const toBoolean = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() === 'true' : value;

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsString()
  @IsNotEmpty()
  HOST = '0.0.0.0';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  /** Comma-separated list of allowed origins, or "*" to allow any origin. */
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1000)
  THROTTLE_TTL_MS = 60_000;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 120;

  @Transform(toBoolean)
  @IsBoolean()
  TRUST_PROXY = false;

  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED = true;

  /** Secret used to sign access tokens (HS256). At least 32 characters. */
  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  /** Access token lifetime in seconds (default 15 minutes). */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(60)
  ACCESS_TOKEN_TTL_SECONDS = 900;

  /** Refresh token (session) lifetime in days. */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(365)
  REFRESH_TOKEN_TTL_DAYS = 30;
}

/**
 * Validates environment variables at startup. If anything is missing or
 * invalid the application refuses to start and lists every problem.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return env;
}
