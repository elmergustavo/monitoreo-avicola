import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { hashApiKey } from '../devices/api-key.util.js';

loadEnv({ path: ['.env', '../.env'], quiet: true });

const DEFAULT_DEVICE = { name: 'Galpón 1', shed: 'Galpón 1' } as const;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
  });

  try {
    const apiKeyHash = hashApiKey(requireEnv('SEED_DEVICE_API_KEY'));

    // Idempotent: running the seed again keeps the same device and settings.
    const device = await prisma.device.upsert({
      where: { apiKeyHash },
      update: {},
      create: {
        ...DEFAULT_DEVICE,
        apiKeyHash,
        settings: { create: {} }, // tempMin 27, tempMax 30, tempAlert 32 (schema defaults)
      },
      include: { settings: true },
    });

    console.log(`Seeded device "${device.name}" (${device.id}) with default settings.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
