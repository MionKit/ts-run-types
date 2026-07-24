// Unit proof that the bundler-lane project knobs the option-parity work forwards
// reach the resolver child argv. The full path is PluginOptions -> ensureResolver
// -> ResolverClientOptions -> buildResolverArgs; this pins the wire (argv) layer.
// singleThreaded produces byte-identical output, so argv presence — not a
// generated-output diff — is the right assertion for it.
import {describe, expect, it} from 'vitest';
import {buildResolverArgs} from '../src/resolver-client.ts';

describe('buildResolverArgs — bundler-lane project knobs', () => {
  it('forwards hashLength as `--hash-length <n>`', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {hashLength: 12});
    const idx = args.indexOf('--hash-length');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('12');
  });

  it('forwards hashLength: 0 (valid — the binary reads 0 as the default 7)', () => {
    const args = buildResolverArgs('/proj', 'tsconfig.json', {hashLength: 0});
    const idx = args.indexOf('--hash-length');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe('0');
  });

  it('omits --hash-length when hashLength is unset', () => {
    expect(buildResolverArgs('/proj', 'tsconfig.json', {})).not.toContain('--hash-length');
  });

  it('forwards singleThreaded as --single-threaded', () => {
    expect(buildResolverArgs('/proj', 'tsconfig.json', {singleThreaded: true})).toContain('--single-threaded');
  });

  it('omits --single-threaded when unset or false', () => {
    expect(buildResolverArgs('/proj', 'tsconfig.json', {})).not.toContain('--single-threaded');
    expect(buildResolverArgs('/proj', 'tsconfig.json', {singleThreaded: false})).not.toContain('--single-threaded');
  });
});
