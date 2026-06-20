/**
 * Model-based / event-sequence skeleton for STATEFUL SUTs (worksheet-A §A2 rows D/E).
 * Adapt from packages/ts-runtypes/test/fuzz/enrich/{enrichModel,enrichFuzzRunner}.ts.
 *
 * Each Command mutates a small MODEL of the SUT's state, drives the real SUT, and
 * asserts an oracle (returning Violations). The generator picks an applicable command
 * each step; the runner replays the whole sequence from one seed and prefix-shrinks a
 * failure to its minimal event count. If fast-check is available, `fc.commands([...]) +
 * fc.modelRun` replaces the runner — the Command/oracle design carries over unchanged.
 */
import type {Violation, CheckCtx} from './oracle-layer.ts';
import {withSeededRandom, mixSeed, prefixShrink} from './seeded-runner.ts';

/** Just enough of the SUT's state to STATE the oracles (not a re-implementation). */
export interface Model {
  // TODO: e.g. fields?: Map<string, string>; authored?: Map<string, string>;
  steps?: number;
}

/** A handle to the real bounded SUT (A1) — the side-effecting boundary you wrapped. */
export interface Sut {
  // TODO: e.g. run?: (args: string[]) => {ok: boolean; output: string};
  reset?: () => void;
}

export interface World {
  model: Model;
  sut: Sut;
}

export interface Command {
  readonly name: string;
  canApply(model: Model): boolean; // precondition — keeps generated sequences valid
  apply(world: World, ctx: CheckCtx, rng: () => number): Violation[]; // mutate model + drive SUT + assert
}

// --- the event alphabet: fill in your commands --------------------------------
export const COMMANDS: Command[] = [
  // {
  //   name: 'addField',
  //   canApply: (model) => true,
  //   apply(world, ctx, rng) {
  //     // 1. mutate world.model;  2. drive world.sut;  3. observe (A4);
  //     // 4. return [] if the oracle holds, else [violation].
  //     return [];
  //   },
  // },
];

export interface SequenceResult {
  seed: number;
  log: string[];
  violations: Violation[];
}

/** Run ONE deterministic sequence of up to maxSteps events on a fresh world. */
export function runOneSequence(makeWorld: () => World, seed: number, maxSteps: number): SequenceResult {
  const world = makeWorld(); // fresh SUT + model per sequence
  const log: string[] = [];
  const violations: Violation[] = [];
  withSeededRandom(seed, () => {
    for (let step = 0; step < maxSteps; step++) {
      const applicable = COMMANDS.filter((command) => command.canApply(world.model));
      if (!applicable.length) break;
      const command = applicable[Math.floor(Math.random() * applicable.length)];
      log.push(command.name);
      const found = command.apply(world, {seed, step}, Math.random);
      if (found.length) {
        violations.push(...found);
        break; // stop at the first failing step so the log IS the path to the failure
      }
    }
  });
  return {seed, log, violations};
}

export interface ModelFuzzReport {
  firstFailSeed: number | null;
  minSteps: number;
  log: string[];
  violations: Violation[];
}

/** Run many sequences; on the first failure, prefix-shrink to the minimal reproducer. */
export function runModelFuzz(makeWorld: () => World, baseSeed: number, sequences: number, maxSteps: number): ModelFuzzReport {
  for (let i = 0; i < sequences; i++) {
    const seed = mixSeed(baseSeed, 'seq', i);
    const result = runOneSequence(makeWorld, seed, maxSteps);
    if (result.violations.length) {
      const minSteps = prefixShrink((k) => runOneSequence(makeWorld, seed, k).violations.length > 0, maxSteps);
      const shrunk = runOneSequence(makeWorld, seed, minSteps);
      return {firstFailSeed: seed, minSteps, log: shrunk.log, violations: shrunk.violations};
    }
  }
  return {firstFailSeed: null, minSteps: 0, log: [], violations: []};
}
