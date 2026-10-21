import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // All files share one database: running them one at a time keeps a file's
    // cleanup (deleting its users) from racing another file's notifications.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
