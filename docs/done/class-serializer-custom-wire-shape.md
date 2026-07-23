# Custom class `serialize` cannot own an arbitrary JSON wire shape

**Status:** todo (pre-existing limitation, surfaced 2026-07-06 while implementing
`class-serializer-optional-serialize.md`)
**Area:** JSON decoder composition (`json_composite.go`, the `ukuw` +
`restoreFromJson` decode chain)

## Symptom

A registered class serializer whose `serialize` returns a value that is **not**
an object with the class's declared property names breaks `createJsonDecoderFn`.
The clearest case is a string:

```ts
class Money {
  constructor(public amount: number, public currency: string) {}
}
registerClassSerializer('billing', Money, {
  serialize: (m) => `${m.amount} ${m.currency}`,           // non-object wire shape
  deserialize: (d) => { const [a, c] = String(d).split(' '); return new Money(Number(a), c); },
});

const decode = createJsonDecoderFn<Money>();
decode(createJsonEncoderFn<Money>()(new Money(4999, 'USD')));
// TypeError: Cannot assign to read only property '0' of string '4999 USD'
```

Renamed / extra keys fail the same way (they get cleared to `undefined` before
`deserialize` sees them).

## Root cause

The default (`strip`) JSON decoder is composed as
`restoreFromJson(unknownKeysToUndefinedWire(JSON.parse(s)))`
([`json_composite.go` jsonDecoder / strategy `strip`](../../ts-go-runtypes/internal/cachegen/typefunctions/json_composite.go)).
The `unknownKeysToUndefinedWire` (`ukuw`) family is generated from the class's
**structural** shape and is NOT wrapped with the class-serializer branch (only
`pj` / `pjs` / `sj` / `rj` / `tb` / `fb` are). So it runs over the raw wire value
assuming the declared object shape, and a custom non-object / renamed shape
either throws (string) or is corrupted (renamed keys set to `undefined`) before
`restoreFromJson` routes to `deserialize`.

This predates the optional-serialize redesign: the old T7 contract required both
halves and the tests / example always returned the declared object shape (the
example returned a string but was only type-checked, never executed).

## Scope note

- **Binary is unaffected.** The binary decoder is `deserialize(JSON.parse(des.desString()))`
  with no structural pre-pass, so a custom `serialize` returning any JSON value
  round-trips through `createBinaryDecoderFn` today.
- **JSON with a declared-shape object works.** `serialize` may re-shape values
  within the declared property names (e.g. store a number as a string).

## Fix options

1. Wrap the `ukuw` (and `cjr` for the compact strategy) decode families with the
   class-serializer branch so a registered class bypasses the structural
   pre-pass and hands the raw parsed value straight to `restoreFromJson`. Care:
   the structural-class case (no custom `serialize`) currently relies on `ukuw`
   to clear undeclared wire keys, so the bypass must still reconstruct correctly
   there (extra keys would otherwise flow into `Object.assign(new cls(), data)`).
2. Emit a dedicated JSON decoder strategy for registered classes that skips the
   unknown-keys pre-pass entirely.

Either way, add a test that a string-returning (and a renamed-key) custom
`serialize` round-trips through `createJsonDecoderFn`, and update
`packages/examples/src/guide/custom-class-serializer.ts` to demonstrate it.
