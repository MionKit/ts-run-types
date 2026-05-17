// Test-only overlay declaration for `@mionjs/ts-go-run-types`.
//
// ─── Why this file exists ────────────────────────────────────────
//
// Two completely separate resolvers see `import { … } from
// '@mionjs/ts-go-run-types'` inside this package's test files:
//
//   1. Vitest / Vite — runtime resolution. Honors `resolve.alias` in
//      vitest.config.ts, which redirects the import to `src/index.ts`.
//      Works fine.
//   2. tsgo (Go-side type checker, invoked by vite-plugin-runtypes to
//      compute runtype ids). Has its OWN module resolver. Does not see
//      vitest's alias map. Walks Node module resolution from scratch.
//
// This overlay is for #2. It declares the module ambient-ly so tsgo
// uses these signatures instead of trying to resolve to the package's
// own `dist/index.d.ts` — which is the path Node's self-reference rule
// leads it to. Picked up automatically by `tsconfig.test.json`'s
// `"include": ["test/**/*"]` glob; no per-file `/// <reference />`
// needed.
//
// ─── The underlying tsgo limitation ──────────────────────────────
//
// When a workspace package's own tests import the package by its
// public name (`@mionjs/ts-go-run-types` here), Node's self-reference
// rule resolves it against THIS package's `package.json`. Our
// package.json points `"types"` at `./dist/index.d.ts`. That file
// is either missing (we deliberately don't pre-build the marker
// package — its `src/` is the SUT, and a mandatory pre-build cycle
// would make every dev iteration painful) or stale relative to
// in-flight source changes.
//
// A cleaner package.json-level fix would be a `"source"` exports
// condition pointing at `src/index.ts`, so tsgo could be told (via
// tsconfig `customConditions`) to resolve source-first inside the
// workspace. Vitest already does the equivalent through
// `resolve.conditions`. We have not yet confirmed whether tsgo's
// resolver honors custom exports conditions; if/when it does, this
// overlay can go away. Until then, the ambient `declare module`
// short-circuits the broken self-reference path entirely.
//
// ─── Scope ───────────────────────────────────────────────────────
//
// Workspace-only. The overlay lives under `test/`, which is NOT in
// the package's `"files"` array. Published consumers install the
// real `dist/index.d.ts` and never see this file.
//
// Mirrors `internal/testfixtures/runtypes.d.ts` — the Go test suite
// uses the same trick for the same reason. See
// [docs/ARCHITECTURE.md → Workspace self-imports in tests] for the
// architectural rationale.
declare module '@mionjs/ts-go-run-types' {
  // Branded-string sentinel — only the phantom `T` matters to the checker.
  export type RuntypeId<T> = string & {readonly __mionRuntypeBrand?: T};

  // Static marker — explicit T, no value.
  export function getRuntypeId<T>(id?: RuntypeId<T>): RuntypeId<T>;
  // Reflection marker — T inferred from a runtime value.
  export function reflectRuntypeId<T>(value: T, id?: RuntypeId<T>): RuntypeId<T>;

  // Validator returned by createIsType.
  export type IsTypeFn = (value: unknown) => boolean;
  // Static-form API: vite-plugin-runtypes injects the trailing id at
  // build time. Returns the precompiled validator dispatched via the
  // virtual:runtypes-isType module.
  export function createIsType<T>(id?: RuntypeId<T>): Promise<IsTypeFn>;
}
