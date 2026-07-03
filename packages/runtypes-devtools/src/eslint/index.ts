// runtypes-devtools/eslint — the RunTypes lint plugin, served from the
// package's `./eslint` subpath. One module works as BOTH an OXlint JS plugin
// (`jsPlugins` in .oxlintrc.json — the primary target; diagnostics reach the
// editor live through the oxc language server) and an ESLint v9 flat-config
// plugin (every rule uses plain `create`, no oxlint-only lifecycle).
//
// The Go resolver is the single diagnostics engine — these rules are pure
// transport. Each linted file takes ONE resolver pass (marker scan +
// enrichment health, see Request.checkEnrich); the routing layer
// (diagnosticRouting.ts) then fans the wire diagnostics out to rules:
//
//   runtypes/error | warn | info     compiler diagnostics, routed by each
//                                    diagnostic's OWN severity so oxlint's
//                                    per-rule severity keeps the error/warn
//                                    CI gate faithful (the code + family ride
//                                    in the message, e.g. "[VL010] …").
//   runtypes/no-enrichment-todo      unfilled @todo scaffold lines.
//   runtypes/no-orphan-carcass       stale @rtOrphan / @rtOrphanChild blocks.
//   runtypes/enrichment-field        FriendlyType/MockData content findings.
//   runtypes/enrichment-drift        mirror breadcrumb drift (source deleted
//                                    or type no longer declared).
//
// Configuration rides the host's shared `settings.runtypes` (binary, socket,
// cwd, timeoutMs — see LintSessionOptions); rules take no per-rule options.

import {createRequire} from 'node:module';
import {routeDiagnostic, type RuleName} from './diagnosticRouting.ts';
import {looksLikeEnrichmentFile, needsResolverPass} from './prefilter.ts';
import {prewarmSession, sharedSession, type LintSessionOptions} from './session.ts';

// Start the session's worker NOW, at plugin load, and hold the load until
// its launcher child exists: hosts that embed the Rust linter in-process
// (oxlint) reserve tens of GB of address space once linting starts, after
// which the resolver child could no longer be forked on Linux — the launcher
// must exist strictly before that. RT_LINT_PRESPAWN=0 opts out.
await prewarmSession();

// Minimal structural view of the rule context — the subset OXlint and ESLint
// both provide. Typed locally so the plugin depends on neither host's types.
interface RuleContext {
  physicalFilename?: string;
  filename?: string;
  sourceCode: {text: string};
  settings?: Record<string, unknown>;
  report(descriptor: {message: string; loc: {start: {line: number; column: number}; end?: {line: number; column: number}}}): void;
}

interface RuleModule {
  meta: {type: 'problem'; docs: {description: string}};
  create(context: RuleContext): Record<string, unknown>;
}

// engineErrorClaims: an engine failure (missing binary, timeout) must surface
// exactly ONCE per file, not once per enabled rule — the first rule to lint a
// file claims its engine-error reporting for the process lifetime.
const engineErrorClaims = new Map<string, RuleName>();

// sessionOptions pulls the plugin's shared configuration from
// `settings.runtypes` (both hosts expose flat-config settings verbatim).
function sessionOptions(settings: Record<string, unknown> | undefined): LintSessionOptions {
  const raw = settings?.['runtypes'];
  if (!raw || typeof raw !== 'object') return {};
  const bag = raw as Record<string, unknown>;
  const options: LintSessionOptions = {};
  if (typeof bag['binary'] === 'string') options.binary = bag['binary'];
  if (typeof bag['socket'] === 'string') options.socket = bag['socket'];
  if (typeof bag['cwd'] === 'string') options.cwd = bag['cwd'];
  if (typeof bag['timeoutMs'] === 'number') options.timeoutMs = bag['timeoutMs'];
  return options;
}

// diagnosticRule builds one transport rule: gate on the cheap text
// pre-filter, run (or replay) the file's single resolver pass, report the
// diagnostics routed to THIS rule.
function diagnosticRule(ruleName: RuleName, description: string, gate: (text: string) => boolean): RuleModule {
  return {
    meta: {type: 'problem', docs: {description}},
    create(context: RuleContext) {
      const text = context.sourceCode.text;
      if (!gate(text)) return {};
      const file = context.physicalFilename ?? context.filename ?? '';
      // Skip unnamed/virtual buffers — the resolver needs a real path to
      // relativize and to resolve the file's imports from disk.
      if (!file || file.startsWith('<')) return {};
      const session = sharedSession();
      const options = sessionOptions(context.settings);
      if (!engineErrorClaims.has(file)) engineErrorClaims.set(file, ruleName);
      return {
        Program: () => {
          const outcome = session.lintFileSync(file, text, options);
          if ('engineError' in outcome) {
            // Never silently drop: whichever rule claimed the file reports
            // the engine failure at the top of the file.
            if (engineErrorClaims.get(file) === ruleName) {
              context.report({message: `[runtypes] ${outcome.engineError}`, loc: {start: {line: 1, column: 0}}});
            }
            return;
          }
          for (const diagnostic of outcome.diagnostics) {
            const report = routeDiagnostic(diagnostic);
            if (report.ruleName !== ruleName) continue;
            context.report({message: report.message, loc: report.loc});
          }
        },
      };
    },
  };
}

const packageVersion = (createRequire(import.meta.url)('../../package.json') as {version: string}).version;

export const meta = {name: 'runtypes', version: packageVersion};

export const rules: Record<RuleName, RuleModule> = {
  error: diagnosticRule(
    'error',
    'RunTypes compiler diagnostics with error severity (unsupported types that throw at runtime, marker misuse, pure-function extraction failures)',
    needsResolverPass
  ),
  warn: diagnosticRule(
    'warn',
    'RunTypes compiler diagnostics with warning severity (non-serializable members silently dropped from validators and codecs)',
    needsResolverPass
  ),
  info: diagnosticRule('info', 'RunTypes compiler diagnostics with info severity', needsResolverPass),
  'no-enrichment-todo': diagnosticRule(
    'no-enrichment-todo',
    'Forbid unfilled @todo scaffold placeholders in generated enrichment files',
    looksLikeEnrichmentFile
  ),
  'no-orphan-carcass': diagnosticRule(
    'no-orphan-carcass',
    'Forbid stale @rtOrphan / @rtOrphanChild carcasses in generated enrichment files (run `ts-runtypes gen --prune` or restore the type)',
    looksLikeEnrichmentFile
  ),
  'enrichment-field': diagnosticRule(
    'enrichment-field',
    'FriendlyType / MockData maps must match the source type (no dead fields, constraints, or placeholders)',
    looksLikeEnrichmentFile
  ),
  'enrichment-drift': diagnosticRule(
    'enrichment-drift',
    'Enrichment mirror files must track a live source (breadcrumb resolves and the source still declares the imported types)',
    looksLikeEnrichmentFile
  ),
};

// recommended: every gate on, info off — the .oxlintrc.json twin of this
// lives in the package README / website documentation. Declared after the
// plugin object so the flat config can reference it.
const plugin = {meta, rules, configs: {} as Record<string, unknown>};

plugin.configs['recommended'] = {
  plugins: {runtypes: plugin},
  rules: {
    'runtypes/error': 'error',
    'runtypes/warn': 'warn',
    'runtypes/info': 'off',
    'runtypes/no-enrichment-todo': 'error',
    'runtypes/no-orphan-carcass': 'error',
    'runtypes/enrichment-field': 'error',
    'runtypes/enrichment-drift': 'error',
  },
};

export const configs = plugin.configs;

export default plugin;
