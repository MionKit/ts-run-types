import {defineConfig} from 'vite';
import UnpluginTypia from '@ryoppippi/unplugin-typia/vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [UnpluginTypia({include: [/cases\.ts$/]})],
  build: {ssr: path.join(here, 'main.ts'), outDir: 'dist', target: 'node22', minify: false, emptyOutDir: true,
    rollupOptions: {output: {entryFileNames: 'run.mjs', format: 'esm'}}},
});
