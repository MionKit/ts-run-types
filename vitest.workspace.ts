// Vitest workspace — lists the package-level vitest configs as
// separate projects so each runs with its own plugin chain (notably
// vite-plugin-runtypes inside ts-runtypes). Mirrors the
// run-types/vitest.config.ts pattern adapted for a multi-project root.
export default [
  'packages/ts-runtypes/vitest.config.ts',
  'packages/vite-plugin-runtypes/vitest.config.ts',
];
