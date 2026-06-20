import {describe} from 'vitest';
import {TUPLE_OVERRIDE} from './Tuples.ts';
import {registerOverrideCase} from './overrideAsserts.ts';

describe('overrides / Tuples', () => {
  registerOverrideCase(TUPLE_OVERRIDE);
});
