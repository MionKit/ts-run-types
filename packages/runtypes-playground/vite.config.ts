import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

// Dev demo + production build for the package's standalone example site.
//
//   vite          (dev)   serves demo/ with the <runtypes-playground> element.
//   vite build            emits a self-contained, base-relative bundle into
//                         dist-site/:
//                           - index.html  the standalone / iframe-embeddable example
//                           - assets/*    the hashed entry chunk, Monaco workers,
//                                         the resolver .wasm + wasm_exec.js
//                           - .vite/manifest.json  maps entry -> hashed filename
//                         so a host (the docs website) can load the web component
//                         directly, with full control over the surrounding page.
//
// Consumers that `import 'runtypes-playground'` instead bundle the package's
// `dist/` (the tsc build) with their own toolchain; this config is only for the
// demo + the prebuilt static bundle.
export default defineConfig({
  root: 'demo',
  // Relative base so built assets resolve under any mount path: the docs site
  // serves them from /playground-app/, and the example also works inside an iframe.
  base: './',
  resolve: {
    // Bundle ts-runtypes from SOURCE (its only bundled import is the bare
    // specifier — the `ts-runtypes/schema` + `/formats` ones are user-snippet
    // strings, not bundled). This keeps the prebuilt bundle in sync with in-tree
    // code, so it never ships a stale `dist/` and needs no prior package build.
    // Mirrors vitest.config's `source` condition; an exact-match regex leaves
    // every other dependency's resolution (Monaco, prettier) untouched.
    alias: [
      {
        find: /^ts-runtypes\/formats$/,
        replacement: fileURLToPath(new URL('../ts-runtypes/src/formats/index.ts', import.meta.url)),
      },
      {find: /^ts-runtypes$/, replacement: fileURLToPath(new URL('../ts-runtypes/src/index.ts', import.meta.url))},
    ],
  },
  server: {fs: {allow: ['..', '../..', '../../..']}},
  optimizeDeps: {exclude: ['monaco-editor']},
  build: {
    outDir: fileURLToPath(new URL('./dist-site', import.meta.url)),
    emptyOutDir: true,
    // Emit a manifest so a host can resolve the content-hashed entry chunk at
    // runtime (no stale stable-name -> hashed-asset mismatch across deploys).
    manifest: true,
    // Monaco ships large chunks; silence the default 500 kB warning.
    chunkSizeWarningLimit: 4096,
  },
});
