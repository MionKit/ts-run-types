import {defineConfig} from 'vite';
import runtypes from 'vite-plugin-runtypes';

// The plugin has one required option (`binary`); everything else has a sane default.
export default defineConfig({
  plugins: [
    runtypes({
      // Required: path to the compiled Go binary that reads your types.
      binary: './bin/ts-runtypes',
      // Optional: where your tsconfig lives. Defaults to 'tsconfig.json'.
      tsconfig: 'tsconfig.json',
      // Optional knobs — see the plugin & CLI reference for the full list.
      // emitMode: 'code',
      // moduleMode: 'default',
    }),
  ],
});
