// Minimal typing for Vite's `import.meta.glob` — used by runtypesPackageSources.ts
// to bundle the ts-runtypes sources into the resolver overlay. The package sets
// `types: []` (no ambient type packages), so ImportMeta is augmented directly here
// instead of pulling in the full `vite/client` types. Only the eager/raw form the
// module uses is declared.
interface ImportMeta {
  glob(
    pattern: string | string[],
    options: {query: string; eager: true; import: string}
  ): Record<string, string>;
}
