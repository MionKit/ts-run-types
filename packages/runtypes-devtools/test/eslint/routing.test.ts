// Unit tests of the transport-agnostic routing layer: wire diagnostic →
// {rule, message, loc}. Pure mapping — no binary, no worker.

import {describe, expect, it} from 'vitest';
import {routeDiagnostic, renderMessage} from '../../src/eslint/diagnosticRouting.ts';
import {Family, Severity, type Diagnostic} from '../../src/protocol.ts';

function diagnostic(partial: Partial<Diagnostic> & {code: string}): Diagnostic {
  return {
    family: Family.RunType,
    severity: Severity.Warning,
    site: {filePath: 'a.ts', startLine: 3, startCol: 5},
    ...partial,
  } as Diagnostic;
}

describe('severity-tier routing (compiler families)', () => {
  it('routes each per-instance severity to its own rule so oxlint severity config stays faithful', () => {
    expect(routeDiagnostic(diagnostic({code: 'MKR003', family: Family.Marker, severity: Severity.Error})).ruleName).toBe('error');
    expect(routeDiagnostic(diagnostic({code: 'VL011', severity: Severity.Warning})).ruleName).toBe('warn');
    expect(routeDiagnostic(diagnostic({code: 'CLS001', severity: Severity.Info})).ruleName).toBe('info');
  });

  it('keeps the stable code in the message for lookup and disable comments', () => {
    const report = routeDiagnostic(diagnostic({code: 'VL011', args: ['onClick']}));
    expect(report.message).toContain('[VL011]');
    expect(report.message).toContain('onClick');
  });
});

describe('enrichment routing (per-concern rules)', () => {
  const cases: Array<[string, string]> = [
    ['FT020', 'no-enrichment-todo'],
    ['MD020', 'no-enrichment-todo'],
    ['FT021', 'no-orphan-carcass'],
    ['FT022', 'no-orphan-carcass'],
    ['MD021', 'no-orphan-carcass'],
    ['MD022', 'no-orphan-carcass'],
    ['FT002', 'enrichment-field'],
    ['FT003', 'enrichment-field'],
    ['FT005', 'enrichment-field'],
    ['FT006', 'enrichment-field'],
    ['FT007', 'enrichment-field'],
    ['FT008', 'enrichment-field'],
    ['FT009', 'enrichment-field'],
    ['FT011', 'enrichment-field'],
    ['MD001', 'enrichment-field'],
    ['MD011', 'enrichment-field'],
    ['GE000', 'enrichment-drift'],
    ['GE002', 'enrichment-drift'],
    ['GE003', 'enrichment-drift'],
  ];
  it.each(cases)('%s → runtypes/%s', (code, ruleName) => {
    expect(routeDiagnostic(diagnostic({code, family: Family.Enrich, severity: Severity.Error})).ruleName).toBe(ruleName);
  });

  it('routes a FUTURE enrich code to enrichment-field rather than dropping it', () => {
    expect(routeDiagnostic(diagnostic({code: 'FT099', family: Family.Enrich})).ruleName).toBe('enrichment-field');
  });
});

describe('location conversion', () => {
  it('converts 1-based wire columns to 0-based loc columns and keeps 1-based lines', () => {
    const report = routeDiagnostic(
      diagnostic({
        code: 'FT020',
        family: Family.Enrich,
        site: {filePath: 'm.ts', startLine: 5, startCol: 4, endLine: 5, endCol: 9},
      })
    );
    expect(report.loc).toEqual({start: {line: 5, column: 3}, end: {line: 5, column: 8}});
  });

  it('emits a start-only loc when the wire site has no end (runtype-family sites)', () => {
    const report = routeDiagnostic(diagnostic({code: 'VL011', site: {filePath: 'a.ts', startLine: 8, startCol: 48}}));
    expect(report.loc).toEqual({start: {line: 8, column: 47}});
  });

  it('clamps a degenerate site to 1:0 so the report still lands in the file', () => {
    const report = routeDiagnostic(diagnostic({code: 'VL011', site: {filePath: 'a.ts', startLine: 0, startCol: 0}}));
    expect(report.loc.start).toEqual({line: 1, column: 0});
  });
});

describe('message rendering', () => {
  it('substitutes positional args through the catalog headline', () => {
    const message = renderMessage(diagnostic({code: 'FT002', family: Family.Enrich, args: ['nope']}));
    expect(message).toBe('[FT002] Unknown field `nope` — the type does not declare it, so this FriendlyType entry is dead.');
  });

  it('appends related locations inline (no first-class field in lint reports)', () => {
    const message = renderMessage(
      diagnostic({
        code: 'PFE9004',
        family: Family.PureFn,
        args: ['ns::fn'],
        related: [{filePath: '/first.ts', startLine: 2, startCol: 1, message: 'first registered here'}],
      })
    );
    expect(message).toContain('\n  related: /first.ts(2,1): first registered here');
  });

  it('never drops an unknown code — renders the regenerate-catalog fallback with the code prefix', () => {
    const message = renderMessage(diagnostic({code: 'ZZ999'}));
    expect(message).toBe('[ZZ999] (message unavailable — regenerate the catalog via `pnpm run gen:diag-catalog`)');
  });
});
