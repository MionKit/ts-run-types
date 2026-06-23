/**
 * Oracle layer skeleton (worksheet-B §B6). One check*() per rule; each returns a
 * replayable Violation or null. Adapt from packages/ts-runtypes/test/fuzz/fuzzOracle.ts.
 * Replace the generic <Value, Output, Wire> with your SUT's real types, and keep only
 * the oracles whose archetype survived the B2 sweep.
 */

/** The SUT's *expected* rejection type — a controlled outcome, not a bug (① totality). */
export class ControlledError extends Error {}

/** The contract between the generator (A) and the oracles (B): the SUT's functions. */
export interface Target<Value, Output, Wire = string> {
  title: string;
  run: (input: Value) => Output; // the bounded SUT (A1)
  encode?: (value: Value) => Wire; // for ② round-trip
  decode?: (wire: Wire) => Value;
  reference?: (input: Value) => Output; // an independent oracle (⑤ differential)
}

export interface CheckCtx {
  seed: number;
  step?: number; // stateful / event SUTs
}

export interface Violation {
  rule: string; // 'totality', 'round-trip', …
  title: string;
  seed: number;
  message: string;
}

const fail = (rule: string, ctx: CheckCtx, title: string, message: string): Violation => ({rule, title, seed: ctx.seed, message});

/** ① totality — only CONTROLLED outcomes; never an uncontrolled throw / hang. */
export function checkTotality<V, O, W>(target: Target<V, O, W>, value: V, ctx: CheckCtx): Violation | null {
  try {
    target.run(value);
    return null;
  } catch (error) {
    if (error instanceof ControlledError) return null; // a declared rejection is fine
    return fail('totality', ctx, target.title, `run() threw uncontrolled: ${String(error)}`);
  }
}

/** ② round-trip — decode∘encode is identity (strongest when an inverse pair exists). */
export function checkRoundTrip<V, O, W>(target: Target<V, O, W>, value: V, ctx: CheckCtx): Violation | null {
  if (!target.encode || !target.decode) return null;
  const back = target.decode(target.encode(value));
  return equals(back, value) ? null : fail('round-trip', ctx, target.title, 'decode(encode(x)) !== x');
}

/** ⑤ differential — run() agrees with an independent reference implementation. */
export function checkDifferential<V, O, W>(target: Target<V, O, W>, value: V, ctx: CheckCtx): Violation | null {
  if (!target.reference) return null;
  return equals(target.run(value), target.reference(value))
    ? null
    : fail('differential', ctx, target.title, 'run() disagrees with reference()');
}

/**
 * ⑧ negative-space — a provably-INVALID value must be reported, never silently
 * accepted. `wasReported` is your observation (A4): a thrown ControlledError, a
 * `false` return, a non-empty diagnostics list — whatever surface exposes the
 * rejection. Pin the SPECIFIC signal (a diagnostic code) once you have observed it.
 */
export function checkNegativeSpace<V, O, W>(
  target: Target<V, O, W>,
  badValue: V,
  ctx: CheckCtx,
  wasReported: (target: Target<V, O, W>, value: V) => boolean
): Violation | null {
  return wasReported(target, badValue)
    ? null
    : fail('negative-space', ctx, target.title, 'a provably-invalid value was silently accepted');
}

/** Structural equality — REPLACE with your real comparison (see test/util/equalsHelpers.ts:
 *  symbols by description, Date/Map/Set/RegExp, Temporal, padded arrays, …). */
function equals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b); // placeholder only
}
