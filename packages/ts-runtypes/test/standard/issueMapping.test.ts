// Unit test for the pure RunTypeError -> Standard Schema Issue mapping. No
// marker calls, so the plugin never transforms this file — it exercises
// `runTypeErrorsToIssues` directly over hand-built error arrays.

import {describe, test, expect} from 'vitest';
import {runTypeErrorsToIssues} from 'ts-runtypes';
import type {RunTypeError} from 'ts-runtypes';

describe('runTypeErrorsToIssues', () => {
  test('string / number path segments pass through as PropertyKeys', () => {
    const errs: RunTypeError[] = [{path: ['profile', 'age'], expected: 'number'}];
    expect(runTypeErrorsToIssues(errs)).toEqual([{message: 'Expected number', path: ['profile', 'age']}]);
  });

  test('array index segment stays a numeric PropertyKey', () => {
    const errs: RunTypeError[] = [{path: ['tags', 2], expected: 'string'}];
    expect(runTypeErrorsToIssues(errs)[0].path).toEqual(['tags', 2]);
  });

  test('Map object segment becomes a {key} PathSegment, preserving the key', () => {
    const errs: RunTypeError[] = [{path: ['m', {key: 'k1', index: 0, failed: 'mapValue'}], expected: 'number'}];
    expect(runTypeErrorsToIssues(errs)[0].path).toEqual(['m', {key: 'k1'}]);
  });

  test('Set object segment (no failed marker) becomes a {key} PathSegment', () => {
    const errs: RunTypeError[] = [{path: ['s', {key: 'item-a', index: 0}], expected: 'string'}];
    expect(runTypeErrorsToIssues(errs)[0].path).toEqual(['s', {key: 'item-a'}]);
  });

  test('format constraint with a primitive bound names the constraint + bound', () => {
    const errs: RunTypeError[] = [
      {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 3, formatPath: ['minLength']}},
    ];
    expect(runTypeErrorsToIssues(errs)[0].message).toBe('Failed minLength constraint (3)');
  });

  test('format constraint with a non-primitive bound omits the bound', () => {
    const errs: RunTypeError[] = [{path: ['x'], expected: 'string', format: {name: 'pattern', val: [], formatPath: ['pattern']}}];
    expect(runTypeErrorsToIssues(errs)[0].message).toBe('Failed pattern constraint');
  });

  test('format with no formatPath tail falls back to the format name', () => {
    const errs: RunTypeError[] = [{path: [], expected: 'string', format: {name: 'uuid', val: true, formatPath: []}}];
    expect(runTypeErrorsToIssues(errs)[0].message).toBe('Failed uuid constraint (true)');
  });

  test('circular error renders "Circular reference" with a plain path', () => {
    const errs: RunTypeError[] = [{path: ['root', 'next'], expected: 'circular'}];
    expect(runTypeErrorsToIssues(errs)).toEqual([{message: 'Circular reference', path: ['root', 'next']}]);
  });

  test('the message option overrides the default derivation', () => {
    const errs: RunTypeError[] = [{path: ['a'], expected: 'string'}];
    const issues = runTypeErrorsToIssues(errs, {message: (e) => `custom:${e.expected}`});
    expect(issues[0].message).toBe('custom:string');
  });

  test('maps one issue per error (flat, no grouping)', () => {
    const errs: RunTypeError[] = [
      {path: ['a'], expected: 'string'},
      {path: ['b'], expected: 'number'},
    ];
    expect(runTypeErrorsToIssues(errs)).toHaveLength(2);
  });
});
