import {describe} from 'vitest';
import {ARRAY_OVERRIDE} from './Arrays.ts';
import {registerOverrideCase} from './overrideAsserts.ts';

describe('overrides / Arrays', () => {
  registerOverrideCase(ARRAY_OVERRIDE);
});
