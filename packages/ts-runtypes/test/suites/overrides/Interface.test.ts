import {describe} from 'vitest';
import {INTERFACE_OVERRIDE} from './Interface.ts';
import {registerOverrideCase} from './overrideAsserts.ts';

describe('overrides / Interface', () => {
  registerOverrideCase(INTERFACE_OVERRIDE);
});
