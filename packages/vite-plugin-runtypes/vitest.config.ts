import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    name: 'vite-plugin-runtypes',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['../../scripts/vitest-global-setup.mjs'],
    // The shared ts-go-run-types daemon owns ONE Program at a time —
    // concurrent setSources from parallel test files would clobber each
    // other's overlay. singleFork serialises file execution while keeping
    // module isolation, so the daemon sees one in-flight request stream
    // at a time.
    poolOptions: {forks: {singleFork: true}},
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
