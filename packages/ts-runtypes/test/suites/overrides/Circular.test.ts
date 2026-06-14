import {describe} from 'vitest';
import {CIRCULAR_OVERRIDE} from './Circular.ts';
import {registerOverrideCase} from './overrideAsserts.ts';

describe('overrides / Circular', () => {
  registerOverrideCase(CIRCULAR_OVERRIDE);
});
