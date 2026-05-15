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
