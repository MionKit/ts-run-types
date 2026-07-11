# Pure-fn extraction silently skips re-export barrels and branded wrappers

## Evidence (2026-07-11, mion migration smoke tests)

In a consumer project with the vite plugin active:

```ts
// direct import — EXTRACTED (bodyHash set, purity-checked):
import {registerPureFnFactory} from '@ts-runtypes/core';
registerPureFnFactory('mionjs::halve', () => (n: number) => n / 2); // bodyHash.length > 0

// re-export barrel (a framework proxy package, e.g. @mionjs/run-types):
// barrel.ts: export * from '@ts-runtypes/core';
import {registerPureFnFactory as viaBarrel} from './barrel.ts';
viaBarrel('mionjs::square', () => (n: number) => n * n); // bodyHash === '' — runtime fallback

// wrapper with the SAME brands (CompTimeArgs<PureFnId> + PureFunction<F>):
export function mionPureFn<F extends PureFactory>(id: CompTimeArgs<PureFnId>, factory: PureFunction<F> | null) {
  return registerPureFnFactory(id, factory as never);
}
mionPureFn('mionjs::triple', () => (n: number) => n * 3); // bodyHash === '' — runtime fallback
```

All three REGISTER and run (the raw-function fallback lane in `pureFn.ts` works), but only the
direct call gets build extraction: bodyHash, stripped code (client shipping), static dep
extraction, and the PFE9xxx purity checks. The skip is silent — no diagnostic.

## Why it matters

- The `registerPureFnFactory` doc comment says discovery is brand-driven ("renaming or
  reordering parameters does NOT break extraction"), which reads as if wrappers work.
- The INJECTION markers (`InjectTypeFnArgs`/`InjectRunTypeId`) DO survive re-export barrels
  (mion's `@mionjs/run-types` proxy relies on that, covered by wrapper-zero-config tests), so
  the pure-fn scanner behaving differently is an inconsistency frameworks will trip over.
- mion wants a `registerMionPureFn('name', factory)` convenience pinned to its `mionjs`
  namespace; today that helper can only ever use the runtime lane.

## Fix plan

1. Resolve the callee through re-exports the same way the marker scanner resolves marker
   aliases (both should key on the ORIGIN declaration in the `ts-runtypes` package), so barrel
   imports extract identically. This is likely the same alias-resolution gap that makes
   marker TYPE aliases unrecognized — one shared fix in the scanner's symbol resolution.
2. Decide the wrapper story explicitly: either honor the brands on ANY function's params (what
   the pureFn.ts comment implies) with pass-through forwarding inside the wrapper body, or
   document that wrappers are runtime-lane only and emit an INFO diagnostic when a braided
   call site falls back (so the skip is never silent).
3. Tests: barrel + wrapper fixtures asserting bodyHash presence (or the chosen diagnostic).

## Workaround (documented in mion's migration-docs)

Import `registerPureFnFactory` from `@ts-runtypes/core` directly with a literal
`'<ns>::<name>'` id for anything that needs build extraction; framework helpers get the
runtime fallback lane.
