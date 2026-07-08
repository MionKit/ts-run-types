// Family 13 — Custom function overrides. overrideValidate<T>(fn) makes
// createValidate<T>() return the custom (stricter) function instead of the
// generated one.
//
// NOTE (see docs/todos/pfe9012-consumer-registerpurefn-false-positive.md): the
// sibling `registerPureFnFactory` feature (guide/custom-pure-fn.ts) is
// deliberately NOT exercised here. Against a PUBLISHED package a consumer
// `registerPureFnFactory` call defeats the resolver's whole-program pure-fn
// guard and falsely flags the runtime's own built-in `rt::` / `rtFormats::`
// pure fns as missing (PFE9012), halting the build. This e2e surfaced that; it
// is tracked in the todo and must land before custom-pure-fn joins the matrix.
import {createValidate, overrideValidate} from '@ts-runtypes/core';
import {type CheckResult, ok} from './check';

interface Widget {
  id: number;
}

// Override the generated validator with a stricter one: id must be EVEN. The
// pure function is self-contained (no outer captures), a PureFunction.
overrideValidate<Widget>(function isEvenWidget(value: unknown): value is Widget {
  const candidate = value as {id?: unknown} | null;
  return typeof candidate === 'object' && candidate !== null && typeof candidate.id === 'number' && candidate.id % 2 === 0;
});
export const isWidget = createValidate<Widget>();

export function checkOverrides(): CheckResult[] {
  return [
    // The override's extra rule (even-only) proves it replaced the generated fn.
    ok('overrides: overrideValidate accepts a value matching the custom rule', isWidget({id: 2})),
    ok('overrides: overrideValidate rejects a value the custom rule excludes', !isWidget({id: 3})),
    ok('overrides: overrideValidate still rejects the wrong shape', !isWidget({id: 'x'})),
  ];
}
