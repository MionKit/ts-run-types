// The lean subset the light smoke apps build: validate (both truthy + falsy),
// reflection (both marker call shapes, with convergence), and one JSON
// round-trip. Enough to prove an adapter loads, transforms marker calls, and
// its output runs — without paying the full-matrix cost on every bundler.
import {createValidateFn, getRunTypeId, createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';
import {type CheckResult, eq, ok} from './check';

export interface Widget {
  id: number;
  name: string;
  when: Date;
}

export const isWidget = createValidateFn<Widget>();

// Both marker call shapes (CLAUDE.md marker rule).
export const widgetIdStatic = getRunTypeId<Widget>();
const sample: Widget = {id: 1, name: 'w', when: new Date('2026-01-01T00:00:00Z')};
export const widgetIdFromValue = getRunTypeId(sample);

export const encodeWidget = createJsonEncoderFn<Widget>();
export const decodeWidget = createJsonDecoderFn<Widget>();

export function selfCheck(): {ok: boolean; results: CheckResult[]} {
  const wire = encodeWidget(sample)!;
  const back = decodeWidget(wire);
  const results: CheckResult[] = [
    ok('minimal: validate accepts a good value', isWidget(sample)),
    ok('minimal: validate rejects a bad value', !isWidget({id: 'x', name: 5, when: 'nope'})),
    ok('minimal: static typeId is a non-empty string', typeof widgetIdStatic === 'string' && widgetIdStatic.length > 0),
    // Convergence: static id ≡ value-first id for equal T.
    eq('minimal: static id ≡ value-first id', widgetIdStatic, widgetIdFromValue),
    ok('minimal: JSON round-trip restores the Date', back.when instanceof Date),
  ];
  return {ok: results.every((result) => result.ok), results};
}
