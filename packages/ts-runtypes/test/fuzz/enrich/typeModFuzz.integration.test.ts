// Type-modification fuzz of the FriendlyType/MockData reconciler. The second,
// wider application of the enrich fuzzer (see enrichFuzz.integration.test.ts):
// instead of editing a flat hardcoded `User`, it generates a RANDOM deep type
// (typeGen) and drives random field-level OPERATIONS on it (typeModify) — rename /
// add / delete / retype / wrap / toggle-optional a property anywhere in a deeply
// nested tree. Every operation reconciles through the real `gen --update` binary, so
// `bin/ts-runtypes` must be built (root `pretest` does this); self-skips if absent.
//
// The headline oracle is NL — nothing authored is ever lost — exactly the "when the
// user edits again nothing is lost" property. The default lane edits an INLINE-only
// type (no Map / Set / named sub-types ⇒ one root const ⇒ no orphan-prone sub-consts)
// and authors labels on the stable ANCHOR fields (which the modifier never deletes /
// renames), pinning that they survive every edit, plus R10 (no crash). Both HOLD
// across a wide deep-nesting space. A failure is a real reconciler regression, printed
// as a shrunk, replayable reproducer.
//
// Opt-in hunts for documented reconciler GAPS (kept out of the green default lane):
//   FUZZ_TYPEMOD_STRICT=1   full named type space + type-rename / named-decl ops +
//                           author EVERY label + assert R6 — reproduces the whole-const
//                           @rtOrphan churn, the type-rename carry failure, and the
//                           data-loss bugs.
//   FUZZ_TYPEMOD_INVALID=1  enable mid-edit source corruptions — tsgo error-recovers
//                           them and a later reconcile can hit an overlapping-splice
//                           `internal error`. All gaps: docs/todos/reconcile-orphan-const-convergence.md.
//
// Knobs: FUZZ_SEED, FUZZ_TYPEMOD_SEQUENCES, FUZZ_TYPEMOD_MAXSTEPS,
//        FUZZ_TYPEMOD_REPLAY=<seed>  (re-run one failing sequence verbatim),
//        FUZZ_TYPEMOD_REPORT=1       (print run / skip / flake / op-coverage stats).

import {existsSync} from 'node:fs';
import {describe, it, expect, afterAll} from 'vitest';
import {cleanupReconcileLane} from '../../util/enrichReconcile.ts';
import {BIN} from './enrichCli.ts';
import {runTypeModFuzz, runOneModSequence, shrinkModFailure, formatModReport} from './typeModFuzzRunner.ts';

afterAll(cleanupReconcileLane);

function parseSeed(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback >>> 0;
  return (raw.startsWith('0x') ? parseInt(raw, 16) : Number(raw)) >>> 0;
}

const HAS_BIN = existsSync(BIN);
const SEED = parseSeed(process.env.FUZZ_SEED, 0x7b9e4d11);
const SEQUENCES = Number(process.env.FUZZ_TYPEMOD_SEQUENCES ?? 6);
const MAX_STEPS = Number(process.env.FUZZ_TYPEMOD_MAXSTEPS ?? 8);
const REPLAY = process.env.FUZZ_TYPEMOD_REPLAY ? parseSeed(process.env.FUZZ_TYPEMOD_REPLAY, 0) : null;

describe('enrichment type-modification fuzz', () => {
  it.skipIf(!HAS_BIN)(
    'never loses authored content under random type operations',
    () => {
      if (REPLAY !== null) {
        const replayed = runOneModSequence(REPLAY, MAX_STEPS);
        if (replayed.violations.length > 0) {
          const report = {
            runs: 1,
            skipped: 0,
            sequences: 1,
            maxSteps: MAX_STEPS,
            seed: REPLAY,
            violations: replayed.violations,
            firstFailureSeed: REPLAY,
            opCounts: {},
            flakes: 0,
          };
          expect.fail(formatModReport(report, shrinkModFailure(REPLAY, MAX_STEPS)));
        }
        return;
      }

      const report = runTypeModFuzz({seed: SEED, sequences: SEQUENCES, maxSteps: MAX_STEPS});
      if (process.env.FUZZ_TYPEMOD_REPORT) {
        const ops = Object.entries(report.opCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([op, n]) => `${op}=${n}`)
          .join(' ');
        console.error(
          `[typemod] runs=${report.runs} skipped=${report.skipped} flakes=${report.flakes} violations=${report.violations.length}\n[typemod] ops: ${ops}`
        );
      }
      if (report.violations.length > 0) {
        const shrunk = shrinkModFailure(report.firstFailureSeed!, MAX_STEPS);
        expect.fail(formatModReport(report, shrunk));
      }
      // Guard against a silently-degenerate run: if EVERY sequence skipped (no
      // usable scaffold), the fuzzer asserted nothing — fail loudly so a broken
      // generator can't masquerade as green.
      expect(report.skipped).toBeLessThan(report.runs);
    },
    180_000
  );
});
