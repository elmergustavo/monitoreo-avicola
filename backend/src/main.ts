import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, GLOBAL_PREFIX } from './app.setup.js';
import type { EnvironmentVariables } from './config/env.validation.js';
import { setupSwagger } from './swagger.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  configureApp(app);
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    setupSwagger(app);
  }

  const host = config.get('HOST', { infer: true });
  const port = config.get('PORT', { infer: true });
  await app.listen(port, host);

  Logger.log(`API listening on http://${host}:${port}/${GLOBAL_PREFIX}`, 'Bootstrap');
}

await bootstrap();
