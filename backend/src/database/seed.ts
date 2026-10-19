import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { generateTemporaryPassword, hashPassword } from '../auth/password.util.js';
import { ADMIN_ROLE_KEY, PERMISSIONS, SYSTEM_ROLES } from '../auth/permissions.js';
import { hashApiKey } from '../devices/api-key.util.js';
import { PrismaClient } from '../generated/prisma/client.js';

loadEnv({ path: ['.env', '../.env'], quiet: true });

/**
 * Idempotent seed:
 *  - system roles (admin always keeps every permission; other roles keep
 *    any permissions customized from the dashboard),
 *  - first administrator from ADMIN_EMAIL, if it does not exist,
 *  - the "Galpón 1" device from SEED_DEVICE_API_KEY, if set.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('Missing required environment variable DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    for (const role of SYSTEM_ROLES) {
      await prisma.role.upsert({
        where: { key: role.key },
        update:
          role.key === ADMIN_ROLE_KEY
            ? { permissions: [...PERMISSIONS], isSystem: true }
            : { isSystem: true },
        create: { ...role, isSystem: true },
      });
    }
    console.log(`Roles: ${SYSTEM_ROLES.map((r) => r.name).join(', ')}`);

    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (adminEmail) {
      const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
      if (existing) {
        console.log(`Admin ${adminEmail} already exists.`);
      } else {
        const providedPassword = process.env.ADMIN_PASSWORD?.trim();
        const password = providedPassword || generateTemporaryPassword();
        const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: ADMIN_ROLE_KEY } });
        await prisma.user.create({
          data: {
            email: adminEmail,
            name: process.env.ADMIN_NAME?.trim() || 'Administrador',
            passwordHash: await hashPassword(password),
            roleId: adminRole.id,
            mustChangePassword: !providedPassword,
          },
        });
        console.log(`Admin created: ${adminEmail}`);
        if (!providedPassword)
          console.log(`Temporary password (change it on first login): ${password}`);
      }
    }

    const deviceKey = process.env.SEED_DEVICE_API_KEY?.trim();
    if (deviceKey) {
      const apiKeyHash = hashApiKey(deviceKey);
      const device = await prisma.device.upsert({
        where: { apiKeyHash },
        update: {},
        create: { name: 'Galpón 1', shed: 'Galpón 1', apiKeyHash, settings: { create: {} } },
      });
      console.log(`Device "${device.name}" (${device.id}) ready.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
