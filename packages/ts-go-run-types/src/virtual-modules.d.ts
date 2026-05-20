// Ambient declarations for vite-plugin-runtypes-served virtual modules.
//
// `vite-plugin-runtypes` registers `virtual:runtypes-isType` as a bundler-
// resolved module whose body is rendered by the Go-side jitfn pipeline.
// The rendered module is pure — importing it has no side effect. Its
// single export is an `install(utl)` function: caller passes any
// JITUtils-shaped object, and `install` materializes every
// `JitCompiledFn` entry against that utl (calling `createJitFn(utl)` and
// `utl.addToJitCache(entry)` for each), then returns a map of entries
// keyed by `get_isType_<hash>`.
//
// In non-vite environments the import fails — by design, since the
// validators only exist when the plugin pipeline produced them.

declare module 'virtual:runtypes-isType' {
  import type {JITUtils} from './jit/jitUtils.ts';

  /** Materialize every precompiled isType entry against `utl`. Each entry
   *  is registered into `utl` via `addToJitCache(entry)` and also surfaces
   *  on the returned map under its `get_isType_<hash>` key for direct
   *  lookup by consumers (e.g. `createIsType`). Calling install more than
   *  once with the same utl is safe — `addToJitCache` is keyed by
   *  jitFnHash so the second call just overwrites with an equivalent
   *  entry. **/
  export function install(utl: JITUtils): Record<string, unknown>;
}

// `vite-plugin-runtypes` populates `virtual:runtypes-parsed-fns` by walking
// every TS file in the program and extracting each
// `registerPureFnFactory(<ns>, <fnName>, <factory>)` call site. The Go
// binary AST-walks, strips TS types from the factory body, computes a
// 14-char bodyHash, and emits the result as a JS map keyed by
// "<namespace>::<functionID>".
//
// `pureFn.ts`'s `registerPureFnFactory` imports `parsedFns` from here and
// looks up its own parsed-fn data — eliminating the prior 4th-argument
// injection pattern.
declare module 'virtual:runtypes-parsed-fns' {
  import type {ParsedFactoryFn} from './jit/types.ts';

  export const parsedFns: Record<string, ParsedFactoryFn>;
}
