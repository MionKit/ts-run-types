// Ambient declarations for vite-plugin-runtypes-served virtual modules.
//
// `vite-plugin-runtypes` registers `virtual:runtypes-isType` as a bundler-
// resolved module whose body is rendered by the Go-side jitfn pipeline.
// The rendered module is self-registering: a module-top `J(…)` factory
// builds one `JitCompiledFn` entry per supported runtype, calls
// `getJitUtils().addToJitCache(entry)` on import, and exports the entry
// under its `get_isType_<hash>` name. Consumers (this package's
// `createIsType`) can read the entry off the named export and call
// `entry.fn(value)` to validate.
//
// In non-vite environments the import fails — by design, since the
// validators only exist when the plugin pipeline produced them.

declare module 'virtual:runtypes-isType' {
  /** Each exported `get_isType_<hash>` is a `JitCompiledFn` entry. The
   *  module's `J(…)` factory already auto-registered every entry into
   *  mion's shared `jitFnsCache` via `addToJitCache` at import time.
   *  Consumers read the precompiled validator off `.fn`:
   *    import * as factories from 'virtual:runtypes-isType';
   *    const entry = factories['get_isType_<hash>'];
   *    const isString = entry.fn;
   *  This shape matches the ESM-style emit produced by the plugin's
   *  load() hook (one `export const get_isType_<hash>` per type). **/
  export const __runtypesIsTypeNamespace: undefined;
}
