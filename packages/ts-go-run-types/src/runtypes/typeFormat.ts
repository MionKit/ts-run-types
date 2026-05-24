// TypeFormat is the brand marker for runtype-format types
// (FormatString, FormatUUIDv4, FormatEmail, …). Concrete format types
// live under `src/formats/` (the `@mionjs/ts-go-run-types/formats`
// subpath); this module just provides the alias and the runtime registry
// plumbing they import.
//
// The shape mirrors mion's `TypeFormat<Base, Name, Params, BrandName>`
// (packages/run-types/src/lib/formats.runtype.ts) but uses a plain
// two-property brand object — `__rtFormatName` + `__rtFormatParams` —
// instead of deepkit's TypeAnnotation tag. Both sides of the wire
// agree on the same brand shape: the tsgo-backed format scanner in
// `internal/compiled/runtype/typeid/formats.go` looks for exactly
// these two sentinel properties and lifts them into the RunType's
// FormatAnnotation field.

// Base types a format may wrap. Primitives (mion's TypeFormatPrimitives)
// plus the native `Date` object for the FormatDate family — the Go-side
// scanner lifts the brand off a `Date & {brand}` intersection the same
// way it does for `string & {brand}`.
export type TypeFormatBase = string | number | bigint | Date;

// TypeFormatParams is the JSON-serialisable shape every format's
// params object must satisfy. Nested objects, arrays of primitives,
// and literal values pass through. `unknown` is preferred over `any`
// so consumers can still narrow at the call site.
export type TypeFormatParams = Record<string, unknown>;

// TypeFormat brands a base primitive with a name+params pair the
// Go-side scanner can detect. The properties are typed as `readonly`
// so the brand survives `as const` widening and TypeScript's
// excess-property checks on object literals don't mistake it for a
// regular property.
//
// `BrandName` follows mion's convention: when provided, it becomes
// the nominal brand carried alongside the format params. The Go-side
// detection ignores `BrandName` — it only cares about the two
// sentinel properties — so this stays a pure TS-level discriminator.
export type TypeFormat<
  Base extends TypeFormatBase,
  Name extends string,
  // `object`, not Record<string, unknown>: interface-typed params
  // (StringParams, FormatParams_Date, …) have no index signature and so
  // don't satisfy Record<string, unknown>. `object` accepts them while
  // still excluding primitives.
  Params extends object,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  BrandName extends string = never,
> = Base & {
  readonly __rtFormatName: Name;
  readonly __rtFormatParams: Params;
};
