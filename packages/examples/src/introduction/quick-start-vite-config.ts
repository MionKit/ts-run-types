import {defineConfig} from 'vite';
import runtypes from 'vite-plugin-runtypes';

// vite.config.ts — add the plugin and point it at the Go binary.
export default defineConfig({
  plugins: [
    runtypes({
      binary: './bin/ts-runtypes', // the native side-channel
      tsconfig: 'tsconfig.json',
    }),
  ],
});
