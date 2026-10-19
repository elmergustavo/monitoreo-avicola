import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Device } from '../generated/prisma/client.js';
import type { DeviceRequest } from './api-key.guard.js';

/** Injects the device authenticated by ApiKeyGuard. */
export const CurrentDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Device =>
    context.switchToHttp().getRequest<DeviceRequest>().device,
);
