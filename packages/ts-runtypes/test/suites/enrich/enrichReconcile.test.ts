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

describe('enrichment reconcile — @todo lifecycle', () => {
  // The new-const flag is a PLAIN `@todo` line comment, deliberately OUTSIDE the
  // `@rt` namespace (which is reserved for compiler-owned machinery). The compiler
  // only emits it; the user/LLM fills the data and deletes the line.

  it('stamps exactly one plain @todo on each newly-generated const', () => {
    const fixture = makeFixture('todo-fresh', 'export interface User { name: string }\n');
    runGen(fixture, 'User');
    const out = readMirror(fixture);
    // friendlyUser + mockUser each carry exactly one @todo line.
    expect(out.match(/@todo/g)?.length, 'one @todo per new const (friendly + mock)').toBe(2);
    // It is a PLAIN @todo, never the @rt-namespaced @rtTodo.
    expect(out, 'the flag is a plain @todo, not @rtTodo').not.toContain('@rtTodo');
    // It sits on its OWN `//` line, after the @rtType marker, before the export.
    expect(out, '@todo follows the marker on a separate line').toMatch(
      /@rtType[^\n]*\*\/\n\/\/ @todo:[^\n]*\nexport const friendly/
    );
  });

  it('does not re-add @todo to an existing const on --update', () => {
    const fixture = makeFixture('todo-existing', 'export interface User { name: string }\n');
    runGen(fixture, 'User');
    // Add a field: existing consts are property-merged, never re-stamped.
    setSource(fixture, 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User', ['--update']);
    const out = readMirror(fixture);
    // Still exactly two @todo (the two original consts) — none added by --update.
    expect(out.match(/@todo/g)?.length, 'no @todo added on update').toBe(2);
  });

  it('keeps a user-cleared @todo cleared across --update', () => {
    const fixture = makeFixture('todo-cleared', 'export interface User { name: string }\n');
    runGen(fixture, 'User');
    // User fills in real data and deletes the @todo line from friendlyUser.
    editMirror(fixture, (text) =>
      text.replace(/\/\/ @todo:[^\n]*\n(export const friendlyUser)/, '$1')
    );
    expect(readMirror(fixture).match(/@todo/g)?.length, 'one @todo left (mockUser)').toBe(1);
    // A reconcile must not regrow the cleared one.
    setSource(fixture, 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User', ['--update']);
    const out = readMirror(fixture);
    expect(out.match(/@todo/g)?.length, 'cleared @todo stays cleared').toBe(1);
    expect(out, 'friendlyUser stays @todo-free').toMatch(/\*\/\nexport const friendlyUser/);
  });

  it('stamps @todo on a const newly ADDED during --update', () => {
    const fixture = makeFixture(
      'todo-added',
      'export interface User { name: string }\n'
    );
    runGen(fixture, 'User');
    // Introduce a referenced named type → new friendlyAddress/mockAddress consts.
    setSource(
      fixture,
      'export interface Address { street: string }\nexport interface User { name: string; home: Address }\n'
    );
    runGen(fixture, 'User', ['--update']);
    const out = readMirror(fixture);
    // Two original + two new = four @todo; the new Address consts are stamped.
    expect(out.match(/@todo/g)?.length, 'new consts each get a @todo').toBe(4);
    expect(out, 'new friendlyAddress carries @todo').toMatch(
      /\/\/ @todo:[^\n]*\nexport const friendlyAddress/
    );
  });

  it('--prune leaves @todo intact', () => {
    const fixture = makeFixture('todo-prune', 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User');
    // Create an @rtOrphanChild carcass so prune has something to strip.
    setSource(fixture, 'export interface User { name: string }\n');
    runGen(fixture, 'User', ['--update']);
    expect(readMirror(fixture)).toContain('@rtOrphanChild');

    const before = readMirror(fixture).match(/@todo/g)?.length ?? 0;
    expect(before, 'precondition: @todo present').toBeGreaterThan(0);
    runPrune(fixture);
    const out = readMirror(fixture);
    expect(out, '@rtOrphan carcasses gone').not.toContain('@rtOrphan');
    expect(out.match(/@todo/g)?.length, '@todo untouched by prune').toBe(before);
  });

  it('is a byte-identical no-op re-run with @todo present (no duplication)', () => {
    const fixture = makeFixture('todo-idempotent', 'export interface User { name: string }\n');
    runGen(fixture, 'User');
    runGen(fixture, 'User', ['--update']);
    const first = readMirror(fixture);
    runGen(fixture, 'User', ['--update']);
    const second = readMirror(fixture);
    expect(second, 'update re-run is byte-identical').toBe(first);
    expect(second.match(/@todo/g)?.length, 'no @todo duplication on re-run').toBe(2);
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
