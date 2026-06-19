import {defineConfig} from 'vitest/config';
import runtypes from 'runtypes-devtools/vite';

// No `binary` option on purpose: the plugin must auto-resolve the host-platform
// binary from the installed ts-runtypes-binary-<os>-<arch> optional dependency
// (via ts-runtypes-bin's getExePath). That resolution is exactly what this
// fixture exists to prove on each platform.
export default defineConfig({
  plugins: [runtypes({tsconfig: 'tsconfig.json'})],
  test: {include: ['test/**/*.test.ts']},
});
