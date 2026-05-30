// Tier 3 — `reflectModel<T>()`: the inverse direction (RunType → typed runtime
// model). Asserts the walker reconstructs the discriminated `{type, formatParams}`
// config from the reflected RunType, that the literal params survive, and that
// the SAME reflector serves both value-first (`RT.object({...})`) and type-first
// (`interface`) declarations — both collapse to the same RunType.
//
// Per the CLAUDE.md marker-coverage rule the scenario carries BOTH the static
// `reflectModel<T>()` form and the reflect `reflectModel(value)` form.
//
// `import '@mionjs/ts-go-run-types/formats'` is the load-bearing side-effect
// import (registers the format metadata the cache module reaches).

import {describe, expect, it} from 'vitest';
import type {TypeFromRT} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/define';
import type {FormatString, FormatNumber} from '@mionjs/ts-go-run-types/formats';
import '@mionjs/ts-go-run-types/formats';

describe('value-first / reflectModel — RunType → typed model (Tier 3)', () => {
  it('reconstructs the discriminated config from a value-first model — static', () => {
    const Model = RT.object({
      name: RT.string({maxLength: 5}),
      age: RT.number({min: 0}),
      active: RT.boolean(),
    });
    const config = RT.reflectModel<TypeFromRT<typeof Model>>();
    expect(config).toEqual({
      name: {type: 'string', formatParams: {maxLength: 5}},
      age: {type: 'number', formatParams: {min: 0}},
      active: {type: 'boolean', formatParams: {}},
    });
  });

  it('reconstructs the discriminated config from a value-first model — reflect', () => {
    const Model = RT.object({
      name: RT.string({maxLength: 5}),
      age: RT.number({min: 0}),
      active: RT.boolean(),
    });
    const probe = {name: 'x', age: 1, active: true} as unknown as TypeFromRT<typeof Model>;
    const config = RT.reflectModel(probe);
    expect(config).toEqual({
      name: {type: 'string', formatParams: {maxLength: 5}},
      age: {type: 'number', formatParams: {min: 0}},
      active: {type: 'boolean', formatParams: {}},
    });
  });

  it('serves a type-first interface too — the same RunType drives both directions', () => {
    interface User {
      email: FormatString<{maxLength: 50}>;
      score: FormatNumber<{min: 0; max: 100}>;
    }
    const config = RT.reflectModel<User>();
    expect(config).toEqual({
      email: {type: 'string', formatParams: {maxLength: 50}},
      score: {type: 'number', formatParams: {min: 0, max: 100}},
    });
  });
});
