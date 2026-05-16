import {describe, it, expect} from 'vitest';
import {getRuntypeId, reflectRuntypeId, type RuntypeId} from '../src/index.ts';

describe('@mionjs/ts-go-run-types', () => {
  it('getRuntypeId throws when no id is injected (transformer inactive)', () => {
    // Direct invocation without the plugin = no trailing id arg. The runtime
    // throws so callers can't quietly get a wrong answer.
    expect(() => getRuntypeId<{foo: number}>()).toThrow(/no id injected/);
  });

  it('getRuntypeId returns the injected id when the transformer is active', () => {
    // Simulate the transformer by passing the trailing id literal directly.
    const id = getRuntypeId<{foo: number}>('abc123' as RuntypeId<{foo: number}>);
    expect(id).toBe('abc123');
  });

  it('reflectRuntypeId throws when no id is injected (transformer inactive)', () => {
    expect(() => reflectRuntypeId({foo: 1})).toThrow(/no id injected/);
  });

  it('reflectRuntypeId returns the injected id when the transformer is active', () => {
    const id = reflectRuntypeId({foo: 1}, 'abc123' as RuntypeId<{foo: number}>);
    expect(id).toBe('abc123');
  });
});
