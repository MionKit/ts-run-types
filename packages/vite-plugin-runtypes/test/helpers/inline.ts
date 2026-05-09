// Test helpers for in-memory inline sources. The Go binary supports
// `--inline-sources-stdin`: tests can hand it `{file: content}` instead of
// pointing it at on-disk fixtures. This file wraps that handshake so tests
// can read like the Deepkit `ts.transform`-style examples — the TS source
// lives next to the assertions.
import path from 'node:path';
import fs from 'node:fs';
import type {Suite, TestAPI} from 'vitest';
import {ResolverClient} from '../../src/resolver-client.js';

const ROOT = path.resolve(__dirname, '../../../..');
export const BIN = path.resolve(ROOT, 'bin/ts-go-run-types');
export const hasBinary = (): boolean => fs.existsSync(BIN);

// Mirror of internal/testfixtures/runtypes.d.ts. Always overlaid by
// `withInlineSources` so per-test fixtures don't have to redeclare the
// fake `@mionjs/ts-go-run-types` module.
export const RUNTYPES_DTS = `declare module '@mionjs/ts-go-run-types' {
  export type RuntypeId<T> = string & {readonly __mionRuntypeBrand?: T};
  export function getRuntypeId<T>(value?: T, id?: RuntypeId<T>): RuntypeId<T>;
}
`;

export type InlineSources = Record<string, string>;

export async function withInlineSources<T>(
  sources: InlineSources,
  fn: (ctx: {client: ResolverClient; sources: InlineSources}) => Promise<T>
): Promise<T> {
  if (!hasBinary()) throw new Error(`ts-go-run-types binary not built: ${BIN}`);
  // runtypes.d.ts is always present so caller's fixtures stay terse. The
  // caller can override by including their own "runtypes.d.ts" key.
  const augmented: InlineSources = {'runtypes.d.ts': RUNTYPES_DTS, ...sources};
  // cwd just has to be a real existing directory; inline mode ignores
  // tsconfig and uses the inferred-Program path, so ROOT is fine.
  const client = new ResolverClient(BIN, ROOT, '', {inlineSources: augmented});
  try {
    return await fn({client, sources: augmented});
  } finally {
    client.close();
  }
}

// Sugar so each test file doesn't repeat the gating boilerplate.
export const runIfBinary = (it: TestAPI): TestAPI['skip'] | TestAPI =>
  hasBinary() ? it : it.skip;

// re-export so test files don't need their own import.
export {ResolverClient};
export type {Suite};
