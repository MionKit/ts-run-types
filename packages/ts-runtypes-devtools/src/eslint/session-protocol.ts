// Shared shapes of the session ↔ worker sync bridge. Kept in a dependency-
// free module so both halves (session.ts on the rule thread, lint-worker.ts
// in the worker) import the same contract.

import type {MessagePort} from 'node:worker_threads';
import type {Diagnostic} from '../protocol.ts';

// WAKE_INDEX is the Int32Array slot the worker stores the completed request's
// seq into (then Atomics.notify) — the rule thread Atomics.waits on it.
export const WAKE_INDEX = 0;

// LintSessionOptions is the plugin-level configuration, read from lint
// `settings.runtypes` (shared config, not per-rule options — every rule
// rides the same session). Settings only become visible with the FIRST
// linted file, so they ride each request; the worker adopts the first
// request's options for its connection.
export interface LintSessionOptions {
  // Explicit resolver binary path; defaults to ts-runtypes-bin's getExePath().
  binary?: string;
  // Unix-socket path of a persistent `ts-runtypes --daemon`; when set the
  // session connects instead of spawning its own child.
  socket?: string;
  // Working directory file paths are relativized against (and the spawned
  // resolver's --cwd). Defaults to process.cwd().
  cwd?: string;
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
  options: LintSessionOptions;
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
