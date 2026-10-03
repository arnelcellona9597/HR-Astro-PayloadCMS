import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Each test file builds its own throwaway SQLite database
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
