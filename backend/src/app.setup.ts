import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { EnvironmentVariables } from './config/env.validation.js';

export const GLOBAL_PREFIX = 'api';

/**
 * Global HTTP configuration shared by main.ts and the e2e tests, so the tests
 * exercise the same pipeline as the real application.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  if (config.get('TRUST_PROXY', { infer: true })) {
    (app as NestExpressApplication).set('trust proxy', 1);
  }

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.use(helmet());
  app.enableCors({ origin: parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true })) });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}

function parseCorsOrigins(value: string | undefined): boolean | string[] {
  if (!value?.trim()) return false;
  if (value.trim() === '*') return true;
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
