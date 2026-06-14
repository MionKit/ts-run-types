import {describe} from 'vitest';
import {ATOMIC_OVERRIDE} from './Atomic.ts';
import {registerOverrideCase} from './overrideAsserts.ts';

describe('overrides / Atomic', () => {
  registerOverrideCase(ATOMIC_OVERRIDE);
});
