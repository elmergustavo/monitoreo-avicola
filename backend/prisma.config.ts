import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Locally the .env file lives at the repository root; in containers the
// variables come from the environment and no file is needed.
loadEnv({ path: ['.env', '../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/database/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
