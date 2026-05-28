import {describe, it, expect} from 'vitest';
import {regexpEscape} from '../src/utils.ts';

// Phase-1 scaffold smoke test. Confirms the package builds, vitest
// picks it up, and the utils module exports the regex helper that
// per-format string emitters in subsequent phases will use.
describe('ts-go-type-formats scaffold', () => {
  it('regexpEscape escapes the spec-listed special characters', () => {
    expect(regexpEscape('a.b*c?')).toBe('a\\.b\\*c\\?');
    expect(regexpEscape('plain')).toBe('plain');
    expect(regexpEscape('[a-z]+')).toBe('\\[a\\-z\\]\\+');
  });
});
