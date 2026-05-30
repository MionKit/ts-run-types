// Mock builders for the 8 builtin Temporal types. Each produces a random
// VALID instance of its type so the mock walker's output re-passes isType
// (which is just `v instanceof Temporal.X`). Dispatched from mockType.ts's
// KindClass arm keyed on the Temporal SubKinds.
//
// `Temporal` is read off globalThis at call time (native on Node 26+, the
// polyfill in tests) — never imported, so production bundles don't pull a
// polyfill. A guarded accessor gives a clear error if Temporal is absent.
//
// v1 keeps mocks in the ISO calendar + UTC time zone (the common case);
// calendar/time-zone variety is out of scope (documented in the spec).

import {RunTypeSubKind} from '../runTypeKind.ts';
import {random} from './mockUtils.ts';

// Minimal structural view of the global Temporal namespace — just the
// constructors + statics the builders call. Avoids a hard dependency on
// the Temporal lib types (which the repo's tsconfig lib predates).
interface TemporalLike {
  PlainDate: {from(s: string): unknown};
  PlainTime: {from(s: string): unknown};
  PlainDateTime: {from(s: string): unknown};
  PlainYearMonth: {from(s: string): unknown};
  PlainMonthDay: {from(s: string): unknown};
  ZonedDateTime: {from(s: string): unknown};
  Instant: {fromEpochMilliseconds(ms: number): unknown; from(s: string): unknown};
  Duration: {from(s: string): unknown};
}

function temporal(): TemporalLike {
  const t = (globalThis as {Temporal?: TemporalLike}).Temporal;
  if (!t) {
    throw new Error(
      '[ts-go-run-types] Temporal is not available in this runtime. ' +
        'Temporal ships natively in Node 26+ / modern browsers; on older runtimes install a polyfill ' +
        "(e.g. `globalThis.Temporal = require('temporal-polyfill').Temporal`)."
    );
  }
  return t;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

// Random calendar parts in safe ranges (day ≤ 28 to avoid month-length edge
// cases — every month has 28 days).
function randomDateParts(): {year: number; month: number; day: number} {
  return {year: random(1970, 2099), month: random(1, 12), day: random(1, 28)};
}
function randomTimeParts(): {hour: number; minute: number; second: number} {
  return {hour: random(0, 23), minute: random(0, 59), second: random(0, 59)};
}

function mockPlainDate(): unknown {
  const d = randomDateParts();
  return temporal().PlainDate.from(`${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`);
}
function mockPlainTime(): unknown {
  const tm = randomTimeParts();
  return temporal().PlainTime.from(`${pad(tm.hour)}:${pad(tm.minute)}:${pad(tm.second)}`);
}
function mockPlainDateTime(): unknown {
  const d = randomDateParts();
  const tm = randomTimeParts();
  return temporal().PlainDateTime.from(
    `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}T${pad(tm.hour)}:${pad(tm.minute)}:${pad(tm.second)}`
  );
}
function mockPlainYearMonth(): unknown {
  const d = randomDateParts();
  return temporal().PlainYearMonth.from(`${pad(d.year, 4)}-${pad(d.month)}`);
}
function mockPlainMonthDay(): unknown {
  const d = randomDateParts();
  return temporal().PlainMonthDay.from(`${pad(d.month)}-${pad(d.day)}`);
}
function mockInstant(): unknown {
  // Random epoch ms within a few decades around the epoch.
  return temporal().Instant.fromEpochMilliseconds(random(0, 4102444800000));
}
function mockZonedDateTime(): unknown {
  const d = randomDateParts();
  const tm = randomTimeParts();
  return temporal().ZonedDateTime.from(
    `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}T${pad(tm.hour)}:${pad(tm.minute)}:${pad(tm.second)}[UTC]`
  );
}
function mockDuration(): unknown {
  // A simple, always-valid positive duration.
  return temporal().Duration.from(
    `P${random(0, 5)}Y${random(0, 11)}M${random(0, 27)}DT${random(0, 23)}H${random(0, 59)}M${random(0, 59)}S`
  );
}

// mockTemporal returns a random valid instance for a Temporal SubKind, or
// undefined when the subKind isn't a Temporal type (caller falls through).
export function mockTemporal(subKind: number): unknown {
  switch (subKind) {
    case RunTypeSubKind.temporalInstant:
      return mockInstant();
    case RunTypeSubKind.temporalZonedDateTime:
      return mockZonedDateTime();
    case RunTypeSubKind.temporalPlainDate:
      return mockPlainDate();
    case RunTypeSubKind.temporalPlainTime:
      return mockPlainTime();
    case RunTypeSubKind.temporalPlainDateTime:
      return mockPlainDateTime();
    case RunTypeSubKind.temporalPlainYearMonth:
      return mockPlainYearMonth();
    case RunTypeSubKind.temporalPlainMonthDay:
      return mockPlainMonthDay();
    case RunTypeSubKind.temporalDuration:
      return mockDuration();
    default:
      return undefined;
  }
}

// isTemporalSubKind reports whether a numeric subKind is a Temporal type.
export function isTemporalSubKind(subKind: number | undefined): boolean {
  return subKind !== undefined && subKind >= RunTypeSubKind.temporalInstant && subKind <= RunTypeSubKind.temporalDuration;
}
