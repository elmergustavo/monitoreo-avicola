import { parseArgs } from 'node:util';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DevicesService } from './devices/devices.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { UsersService } from './users/users.service.js';

/**
 * Administrative commands for the server console (e.g. Dokploy terminal):
 *   node dist/cli.js create-user --email ana@x.com --name "Ana" --role viewer
 *   node dist/cli.js reset-password --email ana@x.com
 *   node dist/cli.js list-devices
 *   node dist/cli.js create-device --name "Galpón 2" --shed "Galpón 2"
 *   node dist/cli.js rotate-device-key --device <device-id>
 */
const USAGE = `Commands:
  create-user --email <email> --name <name> --role <admin|supervisor|viewer|...>
  reset-password --email <email>
  list-devices
  create-device --name <name> --shed <shed>
  rotate-device-key --device <device-id>`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
      shed: { type: 'string' },
      device: { type: 'string' },
    },
  });
  const [command] = positionals;
  const require = (key: keyof typeof values): string => {
    const value = values[key]?.trim();
    if (!value) throw new Error(`Missing --${key}\n\n${USAGE}`);
    return value;
  };

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const users = app.get(UsersService);
    const devices = app.get(DevicesService);

    switch (command) {
      case 'create-user': {
        const role = await prisma.role.findUnique({ where: { key: require('role') } });
        if (!role) throw new Error(`Role "${values.role}" not found`);
        const { user, temporaryPassword } = await users.create(
          { email: require('email').toLowerCase(), name: require('name'), roleId: role.id },
          null,
        );
        console.log(`User created: ${user.email} (${role.name})`);
        console.log(`Temporary password: ${temporaryPassword}`);
        break;
      }
      case 'reset-password': {
        const user = await prisma.user.findUnique({
          where: { email: require('email').toLowerCase() },
        });
        if (!user) throw new Error('User not found');
        const { temporaryPassword } = await users.resetPassword(user.id, null);
        console.log(`Temporary password for ${user.email}: ${temporaryPassword}`);
        break;
      }
      case 'list-devices': {
        for (const device of await devices.list(true)) {
          console.log(
            `${device.id}  ${device.name} (${device.shed})  ${device.active ? 'active' : 'inactive'}`,
          );
        }
        break;
      }
      case 'create-device': {
        const { device, apiKey } = await devices.create(
          { name: require('name'), shed: require('shed') },
          null,
        );
        console.log(`Device created: ${device.name} (${device.id})`);
        console.log(`API key (put it in the ESP32 secrets.h): ${apiKey}`);
        break;
      }
      case 'rotate-device-key': {
        const { apiKey } = await devices.rotateKey(require('device'), null);
        console.log(`New API key: ${apiKey}`);
        console.log('The previous key no longer works: update the ESP32 secrets.h.');
        break;
      }
      default:
        console.log(USAGE);
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : error, 'CLI');
  process.exit(1);
});
