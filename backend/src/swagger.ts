import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GLOBAL_PREFIX } from './app.setup.js';
import { API_KEY_HEADER, API_KEY_SECURITY_NAME } from './devices/api-key.util.js';

export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Monitoreo Avícola API')
      .setDescription(
        'Temperature and irrigation monitoring for Granjas Avícolas La Sierra poultry houses.',
      )
      .setVersion('1.0.0')
      .addBearerAuth({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Dashboard user access token',
      })
      .addApiKey(
        {
          type: 'apiKey',
          in: 'header',
          name: API_KEY_HEADER,
          description: 'Device API key (ESP32)',
        },
        API_KEY_SECURITY_NAME,
      )
      .build(),
  );

  SwaggerModule.setup(`${GLOBAL_PREFIX}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
