// Family 7 — Unknown-keys. Mirrors guide/unknown-keys-*.ts. The four
// undeclared-key handlers: has / strip / errors / toUndefined.
import {
  createHasUnknownKeys,
  createStripUnknownKeys,
  createUnknownKeyErrors,
  createUnknownKeysToUndefined,
} from '@ts-runtypes/core';
import {type CheckResult, ok} from './check';

interface User {
  id: number;
  name: string;
}

export const hasExtra = createHasUnknownKeys<User>();
export const stripExtra = createStripUnknownKeys<User>();
export const extraKeyErrors = createUnknownKeyErrors<User>();
export const blankExtra = createUnknownKeysToUndefined<User>();

export function checkUnknownKeys(): CheckResult[] {
  const clean = {id: 1, name: 'Ada'};
  const dirty = {id: 1, name: 'Ada', admin: true, token: 'secret'};

  const stripped = stripExtra({...dirty}) as Record<string, unknown>;
  const blanked = blankExtra({...dirty}) as Record<string, unknown>;
  const errs = extraKeyErrors(dirty);

  return [
    ok('unknown-keys: has → false when no extras', !hasExtra(clean)),
    ok('unknown-keys: has → true when extras present', hasExtra(dirty)),
    ok('unknown-keys: strip removes undeclared keys', !('admin' in stripped) && !('token' in stripped) && stripped.id === 1),
    ok('unknown-keys: errors reports one entry per undeclared key', errs.length === 2),
    ok('unknown-keys: toUndefined clears value but keeps key', 'admin' in blanked && blanked.admin === undefined),
  ];
}
