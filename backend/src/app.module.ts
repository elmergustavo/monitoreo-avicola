import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { PermissionsGuard } from './auth/permissions.guard.js';
import { EnvironmentVariables, NodeEnv, validateEnv } from './config/env.validation.js';
import { DevicesModule } from './devices/devices.module.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReadingsModule } from './readings/readings.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { RolesModule } from './roles/roles.module.js';
import { TelemetryModule } from './telemetry/telemetry.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Locally the .env file lives at the repository root.
      envFilePath: ['.env', '../.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        // Automated tests log in many times from the same address.
        skipIf: () => config.get('NODE_ENV', { infer: true }) === NodeEnv.Test,
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    DevicesModule,
    TelemetryModule,
    ReportsModule,
    AnalyticsModule,
    NotificationsModule,
    AlertsModule,
    MessagingModule,
    HealthModule,
    ReadingsModule,
    EventsModule,
  ],
  // Guards run in this order: rate limit, user authentication, permissions.
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
