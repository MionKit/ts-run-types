// Transport-agnostic mapping from the resolver's wire diagnostics to lint
// reports: which RULE each diagnostic belongs to, the rendered message, and
// the 0-based-column location shape lint APIs expect. The OXlint/ESLint
// plugin entry (index.ts) is one sink over this module; a future LSP sink
// reuses it unchanged (see the spec's transport-agnostic requirement).

import {DIAGNOSTIC_CATALOG, renderHeadline} from '../diagnosticCatalog.ts';
import {Family, Severity, type Diagnostic, type DiagnosticSite} from '../protocol.ts';

// The plugin's rule names (without the `runtypes/` namespace). Two groups:
//
//   - Severity tiers — every compiler diagnostic (pure-fn / marker / runtype
//     families) routes to the tier matching its own per-instance severity,
//     so oxlint's per-rule severity config stays faithful to the error/warn
//     CI gate. The concrete code + family ride in the message.
//   - Enrichment rules — the enrichment-health codes route to per-concern
//     rules so teams can tune the hygiene gate independently.
export type RuleName =
  | 'error'
  | 'warn'
  | 'info'
  | 'no-enrichment-todo'
  | 'no-orphan-carcass'
  | 'enrichment-field'
  | 'enrichment-drift';

export const ALL_RULE_NAMES: readonly RuleName[] = [
  'error',
  'warn',
  'info',
  'no-enrichment-todo',
  'no-orphan-carcass',
  'enrichment-field',
  'enrichment-drift',
];

// LintLoc is the report location: 1-based line, 0-based column (the
// ESLint/OXlint `loc` convention — our wire sites are 1-based columns).
export interface LintLoc {
  start: {line: number; column: number};
  end?: {line: number; column: number};
}

// LintReport is one routed diagnostic, ready for `context.report`.
export interface LintReport {
  ruleName: RuleName;
  message: string;
  loc: LintLoc;
}

// routeDiagnostic maps one wire diagnostic to its rule + rendered message +
// location. Never returns null — an unknown code still reports (through its
// severity tier / enrich rule) with the fallback message, so a diagnostic is
// never silently dropped.
export function routeDiagnostic(diagnostic: Diagnostic): LintReport {
  return {
    ruleName: ruleNameFor(diagnostic),
    message: renderMessage(diagnostic),
    loc: lintLoc(diagnostic.site),
  };
}

// ruleNameFor picks the rule a diagnostic reports under. Enrichment codes get
// per-concern rules; everything else routes by its own severity.
function ruleNameFor(diagnostic: Diagnostic): RuleName {
  if (diagnostic.family === Family.Enrich) {
    switch (diagnostic.code) {
      case 'ENR001':
        return 'no-enrichment-todo';
      case 'ENR002':
      case 'ENR003':
        return 'no-orphan-carcass';
      case 'GE000':
      case 'GE001':
      case 'GE002':
      case 'GE003':
        return 'enrichment-drift';
      default:
        // FT/MD content codes — and any future enrich code — are per-field
        // content findings.
        return 'enrichment-field';
    }
  }
  switch (diagnostic.severity) {
    case Severity.Error:
      return 'error';
    case Severity.Warning:
      return 'warn';
    default:
      return 'info';
  }
}

// renderMessage resolves code+args through the catalog, prefixes the stable
// code (so users can look it up / disable-comment it), and appends related
// locations inline — lint reports have no first-class related-location field.
//
// Unknown-code fallback: a code the catalog lacks should be unreachable in a
// released install (binary + catalog publish from this one package), but a
// locally-built bin/ts-runtypes can run ahead of the catalog during
// development. Render a useful line instead of dropping the diagnostic.
export function renderMessage(diagnostic: Diagnostic): string {
  const known = diagnostic.code in DIAGNOSTIC_CATALOG;
  const headline = known
    ? renderHeadline(diagnostic.code, diagnostic.args)
    : '(message unavailable — regenerate the catalog via `pnpm run gen:diag-catalog`)';
  let message = `[${diagnostic.code}] ${headline}`;
  for (const related of diagnostic.related ?? []) {
    message += `\n  related: ${related.filePath}(${related.startLine},${related.startCol}): ${related.message}`;
  }
  return message;
}

// lintLoc converts a 1-based wire site to the lint loc shape (0-based
// columns). Sites missing an end keep a start-only loc; a degenerate site
// (unanchored) clamps to 1:0 so the report still lands in the file.
function lintLoc(site: DiagnosticSite): LintLoc {
  const loc: LintLoc = {
    start: {line: Math.max(1, site.startLine), column: Math.max(0, site.startCol - 1)},
  };
  if (site.endLine && site.endCol && (site.endLine > site.startLine || site.endCol > site.startCol)) {
    loc.end = {line: site.endLine, column: Math.max(0, site.endCol - 1)};
  }
  return loc;
}
