// Stages the REAL ts-runtypes package sources onto the resolver's virtual disk
// as a `node_modules/ts-runtypes/` tree, so the wasm resolver type-checks user
// snippets against the ACTUAL public API — the markers, every `createX`
// overload, and the real schema `object` / `optional` / `ObjectType<C>`
// property-modifier machinery — instead of a hand-maintained approximation.
//
// Feeding the real types is what makes a value-first schema snippet resolve to
// the SAME structural id as its type-first equivalent (e.g. `optional(boolean())`
// projects an OPTIONAL property, not a required `boolean | undefined`). The old
// hand-written `markerDts.ts` overlay approximated `optional` as a required
// union and produced materially different codegen for optional-union members.
//
// Read from SOURCE via `import.meta.glob` — the same "from source, never a stale
// dist, no prior package build" contract as the `ts-runtypes` runtime alias in
// vite.config.ts, so the resolver types and the runtime factories can't drift.
// A CUSTOM minimal package.json points the exports DIRECTLY at the `.ts` sources
// (unconditional), so bare bundler resolution + `allowImportingTsExtensions`
// finds them without a `source` custom condition. Two resolver-side pieces make
// this virtual package resolvable: the overlay FS synthesizes the directory tree
// (internal/program/overlay.go), and the marker package-name gate reads
// package.json through that overlay FS (internal/marker/marker.go), not
// os.ReadFile — otherwise the marker's type argument is lost and T resolves to
// `unknown`.

const rawSources = import.meta.glob('../../../ts-runtypes/src/**/*.ts', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>;

const VIRTUAL_PACKAGE_JSON = JSON.stringify(
  {
    name: 'ts-runtypes',
    version: '0.0.0',
    exports: {
      '.': './src/index.ts',
      './schema': './src/schema/index.ts',
      './formats': './src/formats/index.ts',
      './formats/temporal': './src/formats/datetime/temporalFormats.ts',
    },
  },
  null,
  2
);

const MARKER = 'ts-runtypes/src/';

let cached: Record<string, string> | null = null;

// runtypesPackageSources returns the { virtualPath -> content } overlay for the
// resolver: every ts-runtypes source module under `node_modules/ts-runtypes/src/…`
// plus the custom package.json. Paths are relative to the resolver cwd
// (`/virtual`); the engine spreads them into its `setSources` call alongside the
// user's `playground.ts`. Computed once.
export function runtypesPackageSources(): Record<string, string> {
  if (cached) return cached;
  const out: Record<string, string> = {};
  for (const [absPath, content] of Object.entries(rawSources)) {
    const idx = absPath.indexOf(MARKER);
    if (idx === -1) continue;
    const rel = absPath.slice(idx + MARKER.length);
    if (/\.(test|spec)\.ts$/.test(rel)) continue;
    out[`node_modules/ts-runtypes/src/${rel}`] = content;
  }
  out['node_modules/ts-runtypes/package.json'] = VIRTUAL_PACKAGE_JSON;
  cached = out;
  return out;
}
