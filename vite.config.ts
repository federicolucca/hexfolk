import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Served from https://federicolucca.github.io/hexfolk/
  base: '/hexfolk/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The build box is shared: keep the worker count low.
    pool: 'forks',
    maxWorkers: 2,
  },
});
