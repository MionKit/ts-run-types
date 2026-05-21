// Ambient declarations for vite-plugin-runtypes-served virtual modules.
//
// `vite-plugin-runtypes` registers `virtual:runtypes-cache`,
// `virtual:runtypes-isType`, and `virtual:runtypes-parsed-fns` as
// bundler-resolved modules whose body the Go binary renders by:
//
//   1. Reading the hand-authored skeleton at
//      `packages/ts-go-run-types/src/caches/<kind>Cache.ts`.
//   2. Replacing the `// #### REPLACE HERE ####` marker line with
//      generated `factory(jitUtils, …);` calls (and, for the runtypes
//      module, follow-up `cache['<id>'].<slot> = cache['<id2>'];`
//      lines).
//
// Every module exports the SAME shape: an idempotent
// `initCache(jitUtils)` function that materialises the cache against
// the supplied JITUtils and returns the populated `cache` object.
//
// In non-vite environments the skeleton itself is what gets imported —
// `initCache` returns an empty cache, callers see no entries. That's
// the fallback contract: zero-config import works, virtual-module
// magic happens only when the plugin is wired in.

declare module 'virtual:runtypes-cache' {
  import type {JITUtils} from './jit/jitUtils.ts';

  /** Materialises every cached RunType into the module-local table and
   *  returns it. Keyed by the canonical runtype id (raw hash, no
   *  prefix). `jitUtils` is part of the shared cache shape but the
   *  runtypes cache does not register entries with it. **/
  export function initCache(jitUtils: JITUtils): Record<string, unknown>;
  export const cache: Record<string, unknown>;
}

declare module 'virtual:runtypes-isType' {
  import type {JITUtils} from './jit/jitUtils.ts';

  /** Materialises every precompiled isType entry against `jitUtils`. Each
   *  entry is registered into `jitUtils` via `addToJitCache(entry)` and
   *  also surfaces on the returned map under its raw `jitFnHash` key for
   *  direct lookup by consumers (e.g. `createIsType`). Calling more than
   *  once with the same jitUtils is safe — the second call is a no-op
   *  thanks to the skeleton's idempotency guard. **/
  export function initCache(jitUtils: JITUtils): Record<string, unknown>;
  export const cache: Record<string, unknown>;
}

declare module 'virtual:runtypes-parsed-fns' {
  import type {JITUtils} from './jit/jitUtils.ts';
  import type {ParsedFactoryFn} from './jit/types.ts';

  /** Materialises the parsed-fn table and returns it. Keyed by the
   *  composite `"namespace::fnName"` string. The `jitUtils` parameter
   *  is part of the shared cache shape but unused — parsedFns is pure
   *  data and does not need utl interaction. **/
  export function initCache(jitUtils: JITUtils): Record<string, ParsedFactoryFn>;
  export const cache: Record<string, ParsedFactoryFn>;
}
