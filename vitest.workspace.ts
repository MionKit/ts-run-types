// Vitest workspace — lists the package-level vitest configs as
// separate projects so each runs with its own plugin chain (notably
// vite-plugin-runtypes inside ts-go-run-types). Mirrors mion's
// run-types/vitest.config.ts pattern adapted for a multi-project root.
export default [
  'packages/ts-go-run-types/vitest.config.ts',
  'packages/vite-plugin-runtypes/vitest.config.ts',
];
