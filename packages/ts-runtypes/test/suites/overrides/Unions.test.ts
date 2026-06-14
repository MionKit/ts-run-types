import {describe} from 'vitest';
import {UNION_OVERRIDE} from './Unions.ts';
import {registerOverrideCase} from './overrideAsserts.ts';

describe('overrides / Unions', () => {
  registerOverrideCase(UNION_OVERRIDE);
});
