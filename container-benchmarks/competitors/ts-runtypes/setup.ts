// The DATETIME cases' getSamples() build Temporal.PlainDate / PlainTime /
// ZonedDateTime / … values, reading globalThis.Temporal. The benchmark container
// runs Node >= 26, which ships Temporal natively, so no polyfill is installed —
// assert it's present so a misconfigured (pre-26) runtime fails loudly instead of
// producing NaN-laden samples. Imported first from main.ts, before any case runs.
if (typeof (globalThis as {Temporal?: unknown}).Temporal === 'undefined') {
  throw new Error('Temporal global missing — the benchmarks require Node >= 26 (native Temporal, no polyfill).');
}
