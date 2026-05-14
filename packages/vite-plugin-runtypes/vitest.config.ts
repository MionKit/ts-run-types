import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    name: 'vite-plugin-runtypes',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['../../scripts/vitest-global-setup.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
