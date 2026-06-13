// Reconcile lane of the AI-enrichment suite: drives `gen --update` / `gen
// --prune` over throwaway temp projects on disk and asserts the full reconcile
// behaviour — property merge preserves authored values, renames carry values
// under the new key, dropped fields become @rtOrphanChild carcasses, a re-run is
// a byte-identical no-op, and --prune strips the carcasses. The Go binary MUST
// be rebuilt before this runs (the suite spawns bin/ts-runtypes).

import {describe, it, expect, afterAll} from 'vitest';
import {
  makeFixture,
  setSource,
  editMirror,
  readMirror,
  runGen,
  runPrune,
  cleanupReconcileLane,
} from '../../util/enrichReconcile.ts';

afterAll(cleanupReconcileLane);

describe('enrichment reconcile — gen --update', () => {
  it('property merge preserves other fields when a field type changes', () => {
    const fixture = makeFixture('merge-keep', 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User');
    // Author values into friendlyUser + mockUser.
    editMirror(fixture, (text) =>
      text
        .replace("name: {$label: ''}", "name: {$label: 'Full name'}")
        .replace('name: {pool: []}', "name: {pool: ['Alice', 'Bob']}")
    );
    // Change age's type (string), add a field; the structural id changes.
    setSource(fixture, 'export interface User { name: string; age: string; isActive: boolean }\n');
    runGen(fixture, 'User', ['--update']);

    const out = readMirror(fixture);
    expect(out, 'authored friendly value preserved').toContain("name: {$label: 'Full name'}");
    expect(out, 'authored mock pool preserved').toContain("name: {pool: ['Alice', 'Bob']}");
    expect(out, 'new field added in friendly').toContain("isActive: {$label: ''}");
    expect(out, 'new field added in mock').toContain('isActive: {pool: []}');
  });

  it('is a byte-identical no-op on an unchanged re-run', () => {
    const fixture = makeFixture('idempotent', 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User');
    editMirror(fixture, (text) => text.replace("name: {$label: ''}", "name: {$label: 'Full name'}"));
    runGen(fixture, 'User', ['--update']);
    const first = readMirror(fixture);
    runGen(fixture, 'User', ['--update']);
    const second = readMirror(fixture);
    expect(second, 'second --update must be byte-identical').toBe(first);
  });

  it('carries an authored value under a renamed field (Tier-2 primitive)', () => {
    const fixture = makeFixture('rename-primitive', 'export interface User { fullName: string }\n');
    runGen(fixture, 'User');
    editMirror(fixture, (text) => text.replace("fullName: {$label: ''}", "fullName: {$label: 'Full name'}"));
    setSource(fixture, 'export interface User { name: string }\n');
    runGen(fixture, 'User', ['--update']);

    const out = readMirror(fixture);
    expect(out, 'value carried under new key').toContain("name: {$label: 'Full name'}");
    expect(out, 'old key gone').not.toContain('fullName');
    expect(out, 'rename must not orphan').not.toContain('@rtOrphanChild');
  });

  it('carries a named-type reference under a renamed field (Tier-1)', () => {
    const fixture = makeFixture(
      'rename-named',
      'export interface Address { street: string }\nexport interface User { home: Address }\n'
    );
    runGen(fixture, 'User');
    setSource(fixture, 'export interface Address { street: string }\nexport interface User { residence: Address }\n');
    runGen(fixture, 'User', ['--update']);

    const out = readMirror(fixture);
    expect(out, 'reference carried under new key').toContain('residence: friendlyAddress');
    expect(out, 'old key gone').not.toContain('home:');
    expect(out, 'rename must not orphan').not.toContain('@rtOrphanChild');
  });

  it('comments out a removed field as @rtOrphanChild, preserving its value', () => {
    const fixture = makeFixture('orphan-child', 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User');
    editMirror(fixture, (text) => text.replace("age: {$label: ''}", "age: {$label: 'Age in years'}"));
    setSource(fixture, 'export interface User { name: string }\n');
    runGen(fixture, 'User', ['--update']);

    const out = readMirror(fixture);
    expect(out, 'dropped field carcass present').toContain('@rtOrphanChild');
    expect(out, 'dropped value preserved').toContain("age: {$label: 'Age in years'}");
  });
});

describe('enrichment reconcile — gen --prune', () => {
  it('strips @rtOrphanChild carcasses, leaving live fields', () => {
    const fixture = makeFixture('prune', 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User');
    editMirror(fixture, (text) => text.replace("age: {$label: ''}", "age: {$label: 'Age'}"));
    setSource(fixture, 'export interface User { name: string }\n');
    runGen(fixture, 'User', ['--update']);
    expect(readMirror(fixture)).toContain('@rtOrphanChild');

    runPrune(fixture);
    const out = readMirror(fixture);
    expect(out, 'orphan tags gone after prune').not.toContain('@rtOrphan');
    expect(out, 'live field survives').toContain('name:');
  });
});
