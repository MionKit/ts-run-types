import {defineConfig} from 'vite';
import runtypes from 'vite-plugin-runtypes';

// One required option: `binary`, the path to the compiled Go resolver.
// Everything else has a sane default.
export default defineConfig({
  plugins: [
    runtypes({
      binary: './bin/ts-runtypes',
      // Optional: where your tsconfig lives. Defaults to 'tsconfig.json'.
      tsconfig: 'tsconfig.json',
    }),
  ],
});
