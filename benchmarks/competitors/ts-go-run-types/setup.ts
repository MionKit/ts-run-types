// Install the Temporal polyfill on globalThis BEFORE the shared suite samples
// run — the DATETIME cases' getSamples() build Temporal.PlainDate / PlainTime /
// ZonedDateTime / … values, and Node 22 has no native Temporal. Imported first
// from main.ts so the global is set before any case is iterated. Mirrors the
// marker package's vitest test/setup.ts.
import {Temporal} from 'temporal-polyfill';

(globalThis as {Temporal?: unknown}).Temporal = Temporal;
