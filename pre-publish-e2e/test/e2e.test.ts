import {expect, test} from 'vitest';
import {isUser, userTypeId} from '../src/main';

// End to end, from the PUBLISHED packages, on this OS/arch: the plugin resolved
// the host-platform binary, spawned it, and rewrote the marker calls.
test('packaged ts-runtypes validates against the platform binary', () => {
  expect(typeof userTypeId).toBe('string');
  expect(userTypeId.length).toBeGreaterThan(0);
  expect(isUser({id: 1, name: 'Ada', email: 'a@b.c', roles: ['admin']})).toBe(true);
  expect(isUser({id: 'nope', name: 5, email: null, roles: 'x'})).toBe(false);
});
