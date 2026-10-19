import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
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

  /** Public dashboard address, used in links sent by Telegram and WhatsApp. */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  DASHBOARD_URL?: string;

  // --- Telegram (optional: without a token the channel stays off) ---

  /** Bot token from @BotFather. */
  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  /** polling: the API asks Telegram for messages (local). webhook: Telegram calls the API (production). */
  @IsIn(['polling', 'webhook'])
  TELEGRAM_MODE: 'polling' | 'webhook' = 'polling';

  /** Public URL of POST /api/telegram/webhook (webhook mode). */
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  TELEGRAM_WEBHOOK_URL?: string;

  /** Telegram sends it back in a header so the API knows the call is genuine. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{16,256}$/, {
    message: 'TELEGRAM_WEBHOOK_SECRET must be 16-256 letters, digits, _ or -',
  })
  TELEGRAM_WEBHOOK_SECRET?: string;

  // --- WhatsApp through Twilio (optional) ---

  @IsOptional()
  @Matches(/^AC[0-9a-fA-F]{32}$/, { message: 'TWILIO_ACCOUNT_SID must look like AC + 32 hex' })
  TWILIO_ACCOUNT_SID?: string;

  @IsOptional()
  @IsString()
  TWILIO_AUTH_TOKEN?: string;

  /** Sender number. The sandbox one by default. */
  @Matches(/^whatsapp:\+\d{8,15}$/, { message: 'TWILIO_WHATSAPP_FROM must be whatsapp:+<number>' })
  TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886';

  /** Sandbox only: the "join <words>" phrase people send first. Shown in the dashboard. */
  @IsOptional()
  @IsString()
  TWILIO_SANDBOX_JOIN_CODE?: string;

  /** Public URL of POST /api/whatsapp/webhook, exactly as set in Twilio (used to verify signatures). */
  @IsOptional()
  @IsUrl({ require_protocol: true })
  TWILIO_WEBHOOK_URL?: string;
}

/**
 * Validates environment variables at startup. If anything is missing or
 * invalid the application refuses to start and lists every problem.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // "TELEGRAM_BOT_TOKEN=" (empty) means "not set", so optional checks skip it.
  const present = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== ''));
  const env = plainToInstance(EnvironmentVariables, present, {
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
