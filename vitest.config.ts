import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/runtypes/vitest.config.ts', 'packages/vite-plugin-runtypes/vitest.config.ts'],
    include: ['packages/**/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.dist/**', 'third_party/**', 'examples/**', 'bin/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
    },
  },
});
