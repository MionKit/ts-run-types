import { defineConfig } from 'vite';

// Dev/demo config for the package's own demo page (`pnpm --filter
// runtypes-playground demo`). Consumers don't use this — they import the
// package and bundle it with their own toolchain.
export default defineConfig({
  root: 'demo',
  server: { fs: { allow: ['..', '../..', '../../..'] } },
  optimizeDeps: { exclude: ['monaco-editor'] },
});
