import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { Device } from '../generated/prisma/client.js';
import { API_KEY_HEADER } from './api-key.util.js';
import { DevicesService } from './devices.service.js';

export interface DeviceRequest extends Request {
  device: Device;
}

/**
 * Authenticates ESP32 devices through the `x-api-key` header and attaches the
 * matching active device to the request.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly devicesService: DevicesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const apiKey = request.header(API_KEY_HEADER)?.trim();

    if (!apiKey) {
      throw new UnauthorizedException(`Missing ${API_KEY_HEADER} header`);
    }

    const device = await this.devicesService.findActiveByApiKey(apiKey);
    if (!device) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.device = device;
    return true;
  }
}
