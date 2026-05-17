// Ambient declarations for vite-plugin-runtypes-served virtual modules.
//
// `vite-plugin-runtypes` registers `virtual:runtypes-isType` as a bundler-
// resolved module whose body is rendered by the Go-side jitfn pipeline.
// Each `export function get_isType_<hash>(utl){…}` is a factory: invoke
// it with a runtime closure context (currently unused — v1 passes
// `undefined`) and the call returns a boolean validator
// `(value) => boolean` specific to the type with that hash.
//
// Consumers (this package's `createIsType`) import the module by name;
// at runtime the plugin's `load` hook returns the rendered source. In
// non-vite environments the import fails — by design, since the
// validators only exist when the plugin pipeline produced them.

declare module 'virtual:runtypes-isType' {
  /** Each exported `get_isType_<hash>(utl)` returns a validator
   *  `(value) => boolean` for the type with that hash. Consumed via a
   *  namespace import:
   *    import * as factories from 'virtual:runtypes-isType';
   *    const fn = factories['get_isType_<hash>'](undefined);
   *  This shape matches the ESM-style emit produced by the plugin's
   *  load() hook (one `export function get_isType_<hash>` per type). **/
  export const __runtypesIsTypeNamespace: undefined;
}
