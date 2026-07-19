// Shared shapes of the session ↔ worker sync bridge. Kept in a dependency-
// free module so both halves (session.ts on the rule thread, lint-worker.ts
// in the worker) import the same contract.

import type {MessagePort} from 'node:worker_threads';
import type {Diagnostic} from '../protocol.ts';

// WAKE_INDEX is the Int32Array slot the worker stores the completed request's
// seq into (then Atomics.notify) — the rule thread Atomics.waits on it.
export const WAKE_INDEX = 0;

// LintSessionOptions is the plugin's ONE knob, read from lint
// `settings.runtypes.timeoutMs`. Everything else is resolved transparently so
// linting needs no RunTypes-specific configuration: the resolver binary comes
// from ts-runtypes-bin's getExePath() (the launcher the bundler plugins use)
// and the working directory is process.cwd(), the directory the linter itself
// runs in — exactly like any other linter.
export interface LintSessionOptions {
  // Per-file wait budget in milliseconds before the session reports the
  // engine unavailable. Defaults to 60s — the first file pays the child
  // spawn + Program build.
  timeoutMs?: number;
}

export interface LintWorkerData {
  port: MessagePort;
  signal: Int32Array;
}

export interface LintWorkerRequest {
  seq: number;
  file: string;
  text: string;
}

export interface LintWorkerResponse {
  seq: number;
  diagnostics?: Diagnostic[];
  error?: string;
  // fatal marks a CONNECTION-level failure (binary missing, child died) as
  // opposed to a per-file op error — the session goes sticky-dead on fatal
  // so later files answer instantly instead of re-paying the failure.
  fatal?: boolean;
}
