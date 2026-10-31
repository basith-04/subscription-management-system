import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'db/**/*.test.ts'],
    // Integration files share one PostgreSQL database; run them serially.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
})
