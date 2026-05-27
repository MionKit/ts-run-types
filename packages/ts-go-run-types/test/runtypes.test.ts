import {describe, it, expect} from 'vitest';
import {getRuntypeId, reflectRuntypeId, type InjectRuntypeId} from '../src/index.ts';

describe('@mionjs/ts-go-run-types', () => {
  it('getRuntypeId throws when called without an id (runtime backstop)', () => {
    // Invoke through a type-erased indirection so the marker scanner
    // doesn't see `InjectRuntypeId<T>` at the call site and the transformer
    // leaves the call alone. Confirms the runtime helper's defensive
    // throw still fires for any path that bypasses the rewrite
    // (dynamic call sites, eval'd code, consumers without the plugin).
    const erased = getRuntypeId as (...args: unknown[]) => unknown;
    expect(() => erased()).toThrow(/no id injected/);
  });

  it('getRuntypeId returns the injected id when the transformer is active', () => {
    // Simulate the transformer by passing the trailing id literal directly.
    const id = getRuntypeId<{foo: number}>('abc123' as InjectRuntypeId<{foo: number}>);
    expect(id).toBe('abc123');
  });

  it('reflectRuntypeId throws when called without an id (runtime backstop)', () => {
    const erased = reflectRuntypeId as (...args: unknown[]) => unknown;
    expect(() => erased({foo: 1})).toThrow(/no id injected/);
  });

  it('reflectRuntypeId returns the injected id when the transformer is active', () => {
    const id = reflectRuntypeId({foo: 1}, 'abc123' as InjectRuntypeId<{foo: number}>);
    expect(id).toBe('abc123');
  });
});
