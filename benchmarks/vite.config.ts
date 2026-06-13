import {defineConfig, type PluginOption} from 'vite';
import runtypes from 'vite-plugin-runtypes';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The ts-go-run-types Go binary the plugin spawns. Mounted into the container
// at /app/bin/ts-go-run-types; overridable for host runs via RT_BINARY.
const binary = process.env.RT_BINARY ?? path.join(here, 'bin', 'ts-go-run-types');

export default defineConfig(async () => {
  const plugins: PluginOption[] = [runtypes({binary, cwd: here, tsconfig: 'tsconfig.json'})];

  // Typia uses its own compile-time transform — opt in with BENCH_TYPIA=1.
  // Scope the transform to the typia validator file only: typia's whole-file
  // transformer otherwise runs on (and can choke on) unrelated sources.
  if (process.env.BENCH_TYPIA) {
    const UnpluginTypia = (await import('@ryoppippi/unplugin-typia/vite')).default;
    plugins.push(UnpluginTypia({include: [/libs[\\/]typia\.ts$/]}));
  }

  return {
    plugins,
    build: {
      ssr: path.join(here, 'src', 'run.ts'),
      outDir: 'dist',
      target: 'node22',
      minify: false,
      emptyOutDir: true,
      rollupOptions: {
        output: {entryFileNames: 'run.mjs', format: 'esm'},
      },
    },
  };
});
