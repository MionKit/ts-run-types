import {describe, it, expect} from 'vitest';
import {getRuntypeId, getMeta, __setRuntypeMetaResolver, type RuntypeId} from '../src/index.ts';

describe('@mionjs/ts-go-run-types', () => {
  it('getRuntypeId throws when no id is injected (transformer inactive)', () => {
    // Direct invocation without the plugin = no trailing id arg. The runtime
    // throws so callers can't quietly get a wrong answer.
    expect(() => getRuntypeId({foo: 1})).toThrow(/no id injected/);
  });

  it('getRuntypeId returns the injected id when the transformer is active', () => {
    // Simulate the transformer by passing the trailing id literal directly.
    const id = getRuntypeId({foo: 1}, 'abc123' as RuntypeId<{foo: number}>);
    expect(id).toBe('abc123');
  });

  it('getMeta returns undefined when no resolver is installed', () => {
    // Fresh module — no resolver. The lookup returns undefined rather than
    // throwing so library code can probe for the cache cheaply.
    expect(getMeta('anything' as RuntypeId<unknown>)).toBeUndefined();
  });

  it('getMeta routes to the installed resolver', () => {
    const calls: string[] = [];
    __setRuntypeMetaResolver((id) => {
      calls.push(id as string);
      return {kind: 'fake', id};
    });
    const result = getMeta('xyz789' as RuntypeId<unknown>);
    expect(calls).toEqual(['xyz789']);
    expect(result).toEqual({kind: 'fake', id: 'xyz789'});
    // Reset for next test runs (resolver returning undefined ≈ no install).
    __setRuntypeMetaResolver(() => undefined);
  });
});
