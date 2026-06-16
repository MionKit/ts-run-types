<script setup lang="ts">
import {reactive, ref, computed, onMounted} from 'vue';

type CaseStatus = 'ok' | 'fail' | 'not-supported';

/** One metric for a competitor — throughput on the valid (accept), invalid
 *  (reject) and mixed (interleaved) input streams. */
interface PathResult {
  valid?: number;
  invalid?: number;
  mixed?: number;
  status?: CaseStatus;
}

type Path = 'valid' | 'invalid' | 'mixed';

interface Metric {
  key: string;
  label: string;
  metricLabel?: string;
}

interface BenchCase {
  key: string;
  title: string;
  /** results[competitor][metricKey] -> {valid, invalid, status} */
  results: Record<string, Record<string, PathResult>>;
}

interface BenchSection {
  key: string;
  label: string;
  cases: BenchCase[];
}

interface BenchIndex {
  bench: string;
  label: string;
  unit?: 'ops' | 'count';
  /** when true, each competitor splits into valid (accept) + invalid (reject) columns */
  showInvalid?: boolean;
  metrics: Metric[];
  competitors: string[];
  /** competitor/form label -> installed library version (shown under the header) */
  versions?: Record<string, string>;
  /** run environment captured at benchmark time */
  meta?: {generatedAt?: string; os?: string; cpu?: string; cores?: number | null; node?: string; typescript?: string};
  sections: BenchSection[];
}

interface BenchCompetitorSource {
  name: string;
  /** per-metric builder body (validation bench): the function this page measures */
  sources?: {validate?: string; validationErrors?: string};
  /** single source (typecost bench, no metric split) */
  source?: string;
}

interface BenchCaseDetail {
  competitors: BenchCompetitorSource[];
}

interface DetailEntry {
  state: 'loading' | 'ready' | 'error';
  data?: BenchCaseDetail;
  /** highlighted source HTML aligned to data.competitors ('' = render plain) */
  html?: string[];
}

interface AggRow {
  key: string;
  label: string;
  /** values[competitor][path] -> geometric mean (or null) */
  values: Record<string, Record<Path, number | null>>;
}

const props = defineProps<{
  /** bench slug — fetched from /bench-data/<bench>/index.json */
  bench: string;
  /** when set, render only this metric's block (one benchmark per page) */
  metric?: string;
}>();

const {highlight} = useCodeHighlighter();

const index = ref<BenchIndex | null>(null);
const indexState = ref<'loading' | 'ready' | 'missing'>('loading');

/** Row-heatmap coloring style — toggled from the legend; 'tint' background or 'text'. */
const colorMode = ref<'tint' | 'text'>('tint');

const details = reactive<Record<string, DetailEntry>>({});

function rowItem(key: string, title: string) {
  return {key, title};
}

// Shared hover-preview / click-to-pin panel behavior (see useDetailPanel).
const {active, pinned, close, preview, leave, pin, panelEnter, panelLeave} = useDetailPanel<{key: string; title: string}>(loadDetail);

const activeDetail = computed<DetailEntry | undefined>(() => (active.value ? details[active.value.key] : undefined));
const panelState = computed<'loading' | 'ready' | 'error'>(() => activeDetail.value?.state ?? 'loading');

/** The source to show for a competitor on THIS page: the metric-specific builder
 *  body (validation bench), or the single source (typecost). Absent → the
 *  competitor doesn't support this metric (e.g. zod has no boolean validate). */
function metricSource(competitor: BenchCompetitorSource): string | undefined {
  if (props.metric) return competitor.sources?.[props.metric as 'validate' | 'validationErrors'];
  return competitor.source;
}

/** The active row's case data (per-competitor results) — looked up from the index so
 *  the panel can echo the same metric the table cell shows. */
const activeCase = computed<BenchCase | undefined>(() => {
  if (!index.value || !active.value) return undefined;
  for (const section of index.value.sections) {
    const found = section.cases.find((kase) => kase.key === active.value!.key);
    if (found) return found;
  }
  return undefined;
});

/** Detail-panel columns — one per competitor that supports this page's metric, each
 *  carrying the same result (valid + invalid) shown in its table cell. */
const panelColumns = computed(() => {
  const entry = activeDetail.value;
  if (!entry || entry.state !== 'ready' || !entry.data) return [];
  const kase = activeCase.value;
  const metricKey = props.metric ?? index.value?.metrics[0]?.key;
  return entry.data.competitors
    .map((competitor, i) => ({competitor, html: entry.html?.[i], plain: metricSource(competitor)}))
    .filter((col) => col.plain)
    .map((col) => {
      const cell = kase && metricKey ? combinedCell(kase, metricKey, col.competitor.name) : null;
      const status = cell ? (cell.cls.includes('--fail') ? 'fail' : cell.cls.includes('--ok') ? 'ok' : 'na') : 'na';
      return {
        label: col.competitor.name,
        html: col.html,
        plain: col.plain,
        metric: cell ? {valid: cell.valid, invalid: cell.invalid, status} : undefined,
      };
    });
});

/** How each library produces its validator — shown as a per-column tag, explained in
 *  the legend. comptime = AOT (generated at build time: ts-go, typia); jit = compiled
 *  at runtime via codegen (ajv.compile, TypeCompiler.Compile); interpreted = the schema
 *  is walked on every call (zod). */
function strategyOf(competitor: string): 'comptime' | 'jit' | 'interpreted' {
  const name = competitor.toLowerCase();
  if (name.includes('typia') || name.includes('ts-go') || name.includes('ts-run-types')) return 'comptime';
  if (name.includes('ajv') || name.includes('typebox')) return 'jit';
  return 'interpreted';
}

/** Build-strategy tags describe RUNTIME validator construction, so they only apply to
 *  the throughput benches — the typecost (type-instantiation count) table hides them. */
const showStrategy = computed(() => index.value?.unit !== 'count');

/** Installed library version for a column (competitor name, or typecost form label). */
function versionOf(competitor: string): string | undefined {
  return index.value?.versions?.[competitor];
}

/** major.minor, dropping the patch / prerelease noise (4.4.3 → 4.4, 13.0.0-dev → 13.0).
 *  Exception: for 0.x packages the patch IS the meaningful release axis (semver treats
 *  0.minor.patch as breaking.feature), so keep a non-zero patch — e.g. typebox 0.34.49. */
function shortVersion(version: string | undefined): string {
  if (!version) return '';
  const parts = version.split('.');
  const [major, minor] = parts;
  if (minor === undefined) return major;
  if (major === '0') {
    const patch = parts[2]?.match(/^\d+/)?.[0];
    if (patch && Number(patch) !== 0) return `${major}.${minor}.${patch}`;
  }
  return `${major}.${minor}`;
}

/** One-line run-environment summary (date · cpu · os · runtimes) for the info header. */
const runInfo = computed<string | null>(() => {
  const meta = index.value?.meta;
  if (!meta) return null;
  const parts: string[] = [];
  if (meta.generatedAt) {
    const date = new Date(meta.generatedAt);
    if (!Number.isNaN(date.getTime())) parts.push(date.toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'}));
  }
  if (meta.cpu && meta.cpu !== 'unknown') parts.push(meta.cores ? `${meta.cpu} (${meta.cores} cores)` : meta.cpu);
  if (meta.os) parts.push(meta.os);
  if (meta.node) parts.push(`Node ${shortVersion(meta.node.replace(/^v/, ''))}`);
  if (meta.typescript) parts.push(`TypeScript ${shortVersion(meta.typescript)}`);
  return parts.length ? parts.join(' · ') : null;
});

/** Metrics to render — one block per metric, or just the `metric` prop's block. */
const displayedMetrics = computed<Metric[]>(() => {
  if (!index.value) return [];
  return props.metric ? index.value.metrics.filter((m) => m.key === props.metric) : index.value.metrics;
});

/** REALWORLD section first (when present), then the rest in their original order. */
const orderedSections = computed<BenchSection[]>(() => {
  if (!index.value) return [];
  const realworld = index.value.sections.filter((section) => section.key === 'REALWORLD');
  const rest = index.value.sections.filter((section) => section.key !== 'REALWORLD');
  return [...realworld, ...rest];
});

onMounted(async () => {
  try {
    const res = await fetch(`/bench-data/${props.bench}/index.json`);
    if (!res.ok) {
      indexState.value = 'missing';
      return;
    }
    index.value = (await res.json()) as BenchIndex;
    indexState.value = 'ready';
  } catch {
    indexState.value = 'missing';
  }
});

/** Lazy-fetch + highlight a row's competitor sources once, keyed by its case key. */
async function loadDetail(item: {key: string; title: string}) {
  const key = item.key;
  if (details[key]) return;
  details[key] = {state: 'loading'};
  try {
    const res = await fetch(`/bench-data/${props.bench}/${key}.json`);
    if (!res.ok) {
      details[key] = {state: 'error'};
      return;
    }
    const data = (await res.json()) as BenchCaseDetail;
    details[key] = {state: 'ready', data};
    // Highlight the metric-specific source, aligned by competitor index ('' when
    // this competitor has no source for the page's metric).
    const html = await Promise.all(
      data.competitors.map((competitor) => {
        const code = metricSource(competitor);
        return code ? highlight(code, 'ts') : Promise.resolve('');
      }),
    );
    const current = details[key];
    if (current && current.state === 'ready') current.html = html;
  } catch {
    details[key] = {state: 'error'};
  }
}

/** Compact value — ops/sec (1.2M/s) for runtime, or a bare count (1.2M) for the
 *  typecost bench. `bare` drops the `/s` (used for the invalid number, whose unit
 *  is already established by the valid number it sits beside). */
function formatValue(value: number, unit: BenchIndex['unit'], bare = false): string {
  const suffix = bare || unit === 'count' ? '' : '/s';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M${suffix}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k${suffix}`;
  return `${Math.round(value)}${suffix}`;
}

/** Combined cell: the valid (accept) number is the headline, the invalid (reject)
 *  number rides along smaller + dimmer. `cls` colors the whole cell (the valid
 *  number / FAIL / n-a / em-dash); `invalid` is empty when there's no reject
 *  number (always for the single-metric typecost bench). */
interface CombinedCell {
  cls: string;
  valid: string;
  invalid: string;
  /** 0 (worst in its row) → 1 (best); null for non-ok cells. Drives the row heatmap. */
  rank?: number | null;
}

function combinedCell(kase: BenchCase, metricKey: string, comp: string): CombinedCell {
  const result = kase.results[comp]?.[metricKey];
  // No entry at all = the competitor can't express this case → n-a (distinct from
  // a measured 0, which is a real value — e.g. a typecost case that cost the type
  // checker zero extra instantiations).
  if (!result) return {cls: 'bench-val--na', valid: 'n-a', invalid: ''};
  if (result.status === 'fail') return {cls: 'bench-val--fail', valid: 'FAIL', invalid: ''};
  if (result.status === 'not-supported') return {cls: 'bench-val--na', valid: 'n-a', invalid: ''};
  const valid = typeof result.valid === 'number' && result.valid >= 0 ? formatValue(result.valid, index.value?.unit) : '';
  const invalid = typeof result.invalid === 'number' && result.invalid > 0 ? formatValue(result.invalid, index.value?.unit, true) : '';
  if (!valid && !invalid) return {cls: 'bench-val--none', valid: '—', invalid: ''};
  return {cls: 'bench-val--ok', valid: valid || '—', invalid};
}

function combinedAggCell(values: {valid: number | null; invalid: number | null}): CombinedCell {
  const valid = values.valid != null ? formatValue(values.valid, index.value?.unit) : '';
  const invalid = values.invalid != null ? formatValue(values.invalid, index.value?.unit, true) : '';
  // null geomean = the competitor doesn't participate in this row (geomeanOver
  // collapses an all-zero category to 0), so it's n-a — same as a cell.
  if (!valid && !invalid) return {cls: 'bench-val--na', valid: 'n-a', invalid: ''};
  return {cls: 'bench-val--ok', valid: valid || '—', invalid};
}

/** Per-row heatmap ranks: 0 = worst in the row, 1 = best, over the positive values
 *  only (others null). Direction follows the metric — count benches (typecost) are
 *  lower-is-better. Small gaps are dampened toward neutral (0.5) so a row of near-ties
 *  isn't painted a dramatic red→green spread. Dampening is always on. */
function ranksFor(values: (number | null)[]): (number | null)[] {
  const lowerBetter = index.value?.unit === 'count';
  // For typecost (lower-is-better) a 0 is a real value (free) and ranks BEST; for
  // throughput a 0 means "didn't run" and is excluded.
  const counts = (value: number | null): value is number => value != null && (lowerBetter ? value >= 0 : value > 0);
  const present = values.filter(counts);
  if (present.length < 2) return values.map(() => null);
  const min = Math.min(...present);
  const max = Math.max(...present);
  const spread = max > 0 ? (max - min) / max : 0;
  const factor = Math.min(1, spread / 0.25);
  return values.map((value) => {
    if (!counts(value)) return null;
    let rank = max === min ? 0.5 : (value - min) / (max - min);
    if (lowerBetter) rank = 1 - rank;
    return 0.5 + (rank - 0.5) * factor;
  });
}

/** One combined cell per competitor, in column order — computed once per row, each
 *  carrying its row-relative rank for the heatmap. */
function sectionCells(kase: BenchCase, metricKey: string): CombinedCell[] {
  if (!index.value) return [];
  const comps = index.value.competitors;
  const lowerBetter = index.value.unit === 'count';
  const vals = comps.map((comp) => {
    const result = kase.results[comp]?.[metricKey];
    if (!result || result.status !== 'ok' || typeof result.valid !== 'number') return null;
    return lowerBetter || result.valid > 0 ? result.valid : null;
  });
  const ranks = ranksFor(vals);
  return comps.map((comp, i) => ({...combinedCell(kase, metricKey, comp), rank: ranks[i]}));
}

function aggCells(row: AggRow): CombinedCell[] {
  if (!index.value) return [];
  const comps = index.value.competitors;
  const lowerBetter = index.value.unit === 'count';
  const vals = comps.map((comp) => {
    const value = row.values[comp]?.valid;
    if (typeof value !== 'number') return null;
    return lowerBetter || value > 0 ? value : null;
  });
  const ranks = ranksFor(vals);
  return comps.map((comp, i) => ({...combinedAggCell(row.values[comp]), rank: ranks[i]}));
}

/** Geometric mean of the positive values — outlier-resistant summary across cases. */
function geomean(values: number[]): number | null {
  const positive = values.filter((value) => typeof value === 'number' && value > 0);
  if (positive.length === 0) return null;
  return Math.exp(positive.reduce((acc, value) => acc + Math.log(value), 0) / positive.length);
}

/** A competitor "supports" a case for a metric when it ran (not fail / not-supported). */
function caseSupported(kase: BenchCase, comp: string, metricKey: string): boolean {
  const result = kase.results[comp]?.[metricKey];
  return !!result && result.status !== 'fail' && result.status !== 'not-supported';
}

/** Fair comparison basis for an aggregate row: the participants (competitors that
 *  support >=1 of these cases) and the COMMON cases EVERY participant supports.
 *  Geomeans are taken over the common set so a library is never penalised in the
 *  mean for ALSO supporting harder cases the others can't express — otherwise a
 *  broad library's slow exclusive cases drag its mean below a narrow library that
 *  never attempts them. Participants are row-local, so a category one lib can't do
 *  at all doesn't blank the whole row. */
function commonBasis(cases: BenchCase[], metricKey: string): {participants: string[]; common: BenchCase[]} {
  const comps = index.value ? index.value.competitors : [];
  const participants = comps.filter((comp) => cases.some((kase) => caseSupported(kase, comp, metricKey)));
  const common = participants.length > 0 ? cases.filter((kase) => participants.every((comp) => caseSupported(kase, comp, metricKey))) : [];
  return {participants, common};
}

/** Geometric mean of one competitor's `path` values over the given cases. For
 *  throughput (higher-is-better, ops) a 0/absent value means the case didn't run, so
 *  only positive values count. For typecost (count, lower-is-better) a value of 0 is
 *  REAL and the BEST outcome — a type that resolves with zero extra instantiations —
 *  so zeros are kept via +1 smoothing (geomean of value+1, minus 1) instead of being
 *  dropped: dropping them would compute the mean over only a library's EXPENSIVE
 *  cases and hide how often it's free (e.g. TypeBox is free on ~40% of cases, so a
 *  drop-zero geomean wrongly ranked it costlier than zod). Returns 0 when every
 *  measured value was 0, or null when there's no data (renders as n-a / —). */
function geomeanOver(cases: BenchCase[], metricKey: string, comp: string, path: Path): number | null {
  const lowerBetter = index.value?.unit === 'count';
  const values: number[] = [];
  let measured = false;
  for (const kase of cases) {
    const result = kase.results[comp]?.[metricKey];
    if (result && result.status !== 'fail' && result.status !== 'not-supported' && typeof result[path] === 'number') {
      measured = true;
      if (lowerBetter || result[path]! > 0) values.push(result[path]!);
    }
  }
  if (!measured) return null;
  if (lowerBetter) return Math.exp(values.reduce((acc, value) => acc + Math.log(value + 1), 0) / values.length) - 1;
  return geomean(values) ?? 0;
}

/** Per-category + Overall geometric-mean summary for one metric. */
function aggregateFor(metricKey: string): AggRow[] {
  if (!index.value) return [];
  const competitors = index.value.competitors;
  const rows: AggRow[] = [];
  const allCases: BenchCase[] = [];

  // Typecost (lower-is-better): PER-COMPETITOR basis. Each library is geomean'd over
  // the cases IT supports — its own n-a cases drop out (geomeanOver skips them), but a
  // case still counts for the other libraries that DO support it; a library that
  // supports nothing here renders n-a. Throughput (higher-is-better): COMMON basis —
  // every participant over the same cases all support, so a library that skips slow
  // cases can't look faster than one that runs them.
  const lowerBetter = index.value?.unit === 'count';
  const rowValues = (cases: BenchCase[]): AggRow['values'] => {
    const values: AggRow['values'] = {};
    if (lowerBetter) {
      for (const comp of competitors) {
        values[comp] = {
          valid: geomeanOver(cases, metricKey, comp, 'valid'),
          invalid: geomeanOver(cases, metricKey, comp, 'invalid'),
          mixed: geomeanOver(cases, metricKey, comp, 'mixed'),
        };
      }
      return values;
    }
    const {participants, common} = commonBasis(cases, metricKey);
    for (const comp of competitors) {
      values[comp] = participants.includes(comp)
        ? {
            valid: geomeanOver(common, metricKey, comp, 'valid'),
            invalid: geomeanOver(common, metricKey, comp, 'invalid'),
            mixed: geomeanOver(common, metricKey, comp, 'mixed'),
          }
        : {valid: null, invalid: null, mixed: null};
    }
    return values;
  };

  for (const section of orderedSections.value) {
    allCases.push(...section.cases);
    rows.push({key: section.key, label: section.label, values: rowValues(section.cases)});
  }
  rows.push({key: '__overall__', label: 'Overall', values: rowValues(allCases)});
  return rows;
}

/** Precomputed aggregates keyed by metric. */
const aggregates = computed<Record<string, AggRow[]>>(() => {
  if (!index.value) return {};
  return Object.fromEntries(index.value.metrics.map((metric) => [metric.key, aggregateFor(metric.key)]));
});
</script>

<template>
  <div class="bench-table" :class="`bench-color-${colorMode}`">
    <div v-if="indexState === 'loading'" class="bench-note bench-note--muted">
      <span class="bench-prompt">$</span> loading benchmark&hellip;
    </div>

    <div v-else-if="indexState === 'missing'" class="bench-note">
      <span class="bench-prompt">$</span> Benchmark data not generated yet — run
      <code>pnpm run gen:bench-docs</code>.
    </div>

    <template v-else-if="index">
      <!-- One metric block: the # title, then the how-to-read info (cell format,
           strategy key, row-colour controls) between the title and the tables. -->
      <div v-for="metric in displayedMetrics" :key="metric.key" class="bench-metric-block">
        <div class="bench-metric">
          <span class="bench-prompt">#</span> <strong class="bench-metric-name">{{ metric.label }}</strong>
          <span v-if="metric.metricLabel" class="bench-metric-sub">{{ metric.metricLabel }}</span>
        </div>
        <p class="bench-metric-hint">hover any row for each competitor's source</p>

        <div class="bench-legend">
          <!-- Run environment: when the benchmarks ran + the machine + library versions. -->
          <div v-if="runInfo" class="bench-runinfo">
            <span class="bench-prompt">@</span> <span class="bench-runinfo-text">measured {{ runInfo }}</span>
          </div>
          <div v-if="index.showInvalid" class="bench-legend-row bench-legend-metric">
            <span class="bench-legend-sample"><span class="bench-val-wrap"><span class="bench-val-primary bench-val--ok">24M/s</span><span class="bench-val-secondary">47M</span></span></span>
            <span class="bench-legend-note">
              each cell = ops/sec on <span class="bench-legend-valid">valid input</span> (headline) and, smaller, on
              <span class="bench-legend-invalid">invalid input</span><br/><code>FAIL</code> = wrong answer, <code>n-a</code> = unsupported
            </span>
          </div>
          <div v-else class="bench-legend-row bench-legend-metric">
            <span class="bench-legend-note">
              each cell = {{ index.unit === 'count' ? 'TypeScript type-instantiations — lower is better' : 'validations/sec — higher is better' }};
              <code>0</code> is a real value, <code>n-a</code> = unsupported
            </span>
          </div>
          <div v-if="showStrategy" class="bench-legend-strategy">
            <span class="bench-legend-srow"><span class="bench-tag bench-tag--comptime">comptime</span> <span class="bench-legend-note">generated at build time<br /><span class="bench-strat-perf">(no perf hit)</span></span></span>
            <span class="bench-legend-srow"><span class="bench-tag bench-tag--jit">jit</span> <span class="bench-legend-note">compiled at runtime<br /><span class="bench-strat-perf">(perf hit when creating fn)</span></span></span>
            <span class="bench-legend-srow"><span class="bench-tag bench-tag--interpreted">interpreted</span> <span class="bench-legend-note">walked per call<br /><span class="bench-strat-perf">(perf hit when running fn)</span></span></span>
          </div>
          <div class="bench-legend-row bench-legend-footer">
            <span class="bench-legend-note">row colour</span>
            <button type="button" class="bench-color-btn" :class="{'bench-color-btn--on': colorMode === 'tint'}" @click="colorMode = 'tint'">tint</button>
            <button type="button" class="bench-color-btn" :class="{'bench-color-btn--on': colorMode === 'text'}" @click="colorMode = 'text'">text</button>
            <span class="bench-legend-note">{{ index.unit === 'count' ? 'most' : 'slowest' }}</span>
            <span class="bench-grad" aria-hidden="true"></span>
            <span class="bench-legend-note">{{ index.unit === 'count' ? 'fewest' : 'fastest' }} · per row</span>
          </div>
        </div>

        <!-- Aggregated summary first: geometric mean per competitor + path. -->
        <section class="bench-section">
          <header class="bench-caption">
            <span class="bench-prompt">&Sigma;</span> Aggregated · geometric mean
            <span class="bench-agg-hint">{{ index.unit === 'count' ? 'lower is better' : 'higher is better' }}</span>
          </header>
          <div class="bench-scroll">
            <table class="bench-grid">
              <colgroup>
                <col class="bench-col--case" />
                <col v-for="comp in index.competitors" :key="comp" />
              </colgroup>
              <thead>
                <tr class="bench-head">
                  <th class="bench-th bench-th--case">category</th>
                  <th v-for="comp in index.competitors" :key="comp" class="bench-th bench-th--comp">
                    <span class="bench-th-name">{{ comp }}</span>
                    <span v-if="versionOf(comp)" class="bench-th-version" :title="versionOf(comp)">v{{ shortVersion(versionOf(comp)) }}</span>
                    <span v-if="showStrategy" class="bench-tag" :class="`bench-tag--${strategyOf(comp)}`">{{ strategyOf(comp) }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in aggregates[metric.key]"
                  :key="row.key"
                  class="bench-row bench-row--agg"
                  :class="{'bench-row--overall': row.key === '__overall__'}"
                >
                  <td class="bench-cell bench-cell--case">{{ row.label }}</td>
                  <td v-for="(cc, ci) in aggCells(row)" :key="ci" class="bench-cell bench-val" :class="[cc.cls, {'bench-val--ranked': cc.rank != null}]" :style="cc.rank != null ? {'--rank': cc.rank} : undefined">
                    <span class="bench-val-wrap"><span class="bench-val-primary">{{ cc.valid }}</span><span v-if="cc.invalid" class="bench-val-secondary">{{ cc.invalid }}</span></span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-for="section in orderedSections" :key="section.key" class="bench-section">
          <header class="bench-caption">
            <span class="bench-prompt">&gt;</span> {{ section.label }}
          </header>

          <div class="bench-scroll">
            <table class="bench-grid">
              <colgroup>
                <col class="bench-col--case" />
                <col v-for="comp in index.competitors" :key="comp" />
              </colgroup>
              <thead>
                <tr class="bench-head">
                  <th class="bench-th bench-th--case">case</th>
                  <th v-for="comp in index.competitors" :key="comp" class="bench-th bench-th--comp">
                    <span class="bench-th-name">{{ comp }}</span>
                    <span v-if="versionOf(comp)" class="bench-th-version" :title="versionOf(comp)">v{{ shortVersion(versionOf(comp)) }}</span>
                    <span v-if="showStrategy" class="bench-tag" :class="`bench-tag--${strategyOf(comp)}`">{{ strategyOf(comp) }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="kase in section.cases"
                  :key="kase.key"
                  class="bench-row"
                  :class="{'bench-row--active': active?.key === kase.key}"
                  tabindex="0"
                  @mouseenter="preview(rowItem(kase.key, kase.title))"
                  @mouseleave="leave()"
                  @focus="preview(rowItem(kase.key, kase.title))"
                  @blur="leave()"
                  @click="pin(rowItem(kase.key, kase.title))"
                  @keydown.enter.prevent="pin(rowItem(kase.key, kase.title))"
                  @keydown.space.prevent="pin(rowItem(kase.key, kase.title))"
                >
                  <td class="bench-cell bench-cell--case">{{ kase.title }}</td>
                  <td v-for="(cc, ci) in sectionCells(kase, metric.key)" :key="ci" class="bench-cell bench-val" :class="[cc.cls, {'bench-val--ranked': cc.rank != null}]" :style="cc.rank != null ? {'--rank': cc.rank} : undefined">
                    <span class="bench-val-wrap"><span class="bench-val-primary">{{ cc.valid }}</span><span v-if="cc.invalid" class="bench-val-secondary">{{ cc.invalid }}</span></span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>

    <!-- Shared full-width bottom detail panel (see DetailPanel + useDetailPanel). -->
    <DetailPanel
      :open="!!active"
      :pinned="pinned"
      :title="active?.title ?? ''"
      :state="panelState"
      :columns="panelColumns"
      @close="close"
      @panelenter="panelEnter"
      @panelleave="panelLeave"
    />
  </div>
</template>

<style scoped>
.bench-table {
  margin: 1.5rem 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.bench-prompt {
  color: var(--ui-primary, #79af43);
  user-select: none;
}

.bench-metric-block + .bench-metric-block {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px dashed rgba(138, 168, 94, 0.3);
}

.bench-metric {
  margin: 0 0 0.3rem;
  font-size: 0.78rem;
  color: var(--ui-text-muted, #9aa0a6);
}

.bench-metric-name {
  color: var(--ui-text-highlighted, #e8eaed);
  font-size: 0.92rem;
}

/* Hover hint directly under the # title, above the how-to-read info. */
.bench-metric-hint {
  margin: 0 0 0.9rem;
  font-size: 0.72rem;
  color: var(--ui-text-muted, #9aa0a6);
}

.bench-metric-sub {
  margin-left: 0.5rem;
}

/* How-to-read legend: metric + combined cell + status symbols + build-strategy tags. */
.bench-legend {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin: 0 0 1.25rem;
  padding: 0.55rem 0.85rem;
  font-size: 0.74rem;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.25));
  border-radius: 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.4));
}

.bench-legend-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.55rem;
}

/* Row-colour controls sit at the bottom of the legend, set off by a subtle rule. */
.bench-legend-footer {
  margin-top: 0.2rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ui-border, rgba(138, 168, 94, 0.18));
}

.bench-legend-sample {
  flex: none;
  padding: 0.1rem 2.4rem 0.1rem 0.4rem;
  font-size: 0.82rem;
}

.bench-legend-note {
  color: var(--ui-text-muted, #9aa0a6);
  line-height: 1.4;
}

.bench-legend code {
  color: var(--ui-text-highlighted, #e8eaed);
}

/* Build-strategy tag (comptime / jit / interpreted) — in column headers + legend. */
/* Plain coloured text (more readable than a bordered pill). */
.bench-tag {
  display: inline-block;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.45;
}

.bench-tag--comptime {
  color: var(--ui-primary, #79af43);
}

.bench-tag--jit {
  color: var(--rt-note, #c8b072);
}

.bench-tag--interpreted {
  color: var(--ui-text-dimmed, var(--ui-text-muted, #9aa0a6));
}

/* Strategy key — three equal columns (comptime / jit / interpreted), left-aligned,
   glosses wrap within their column; set off by a subtle rule like the footer. */
.bench-legend-strategy {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: start;
  gap: 0.3rem 1.25rem;
  margin-top: 0.2rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--ui-border, rgba(138, 168, 94, 0.18));
}

.bench-legend-srow {
  line-height: 1.45;
}

.bench-legend-srow .bench-tag {
  margin-right: 0.35rem;
}

/* Second line: the performance note, a touch dimmer than the mechanism text. */
.bench-strat-perf {
  color: var(--ui-text-dimmed, var(--ui-text-muted, #9aa0a6));
}

/* Metric-explanation row: let the description text expand to fill the row. */
.bench-legend-metric .bench-legend-note {
  flex: 1;
  min-width: 0;
}

/* Row-heatmap controls + gradient sample. */
.bench-color-btn {
  padding: 0.1rem 0.5rem;
  font-family: inherit;
  font-size: 0.7rem;
  color: var(--ui-text-muted, #9aa0a6);
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.25));
  border-radius: 0.3rem;
}

.bench-color-btn--on {
  color: var(--ui-text-highlighted, #e8eaed);
  border-color: var(--ui-primary, #79af43);
  background: rgba(138, 168, 94, 0.12);
}

.bench-grad {
  display: inline-block;
  width: 84px;
  height: 0.5rem;
  border-radius: 0.25rem;
  background: linear-gradient(90deg, hsl(0 55% 50%), hsl(65 55% 50%), hsl(130 55% 50%));
}

.bench-legend-valid {
  color: var(--ui-primary, #79af43);
}

.bench-legend-invalid {
  color: var(--ui-text-dimmed, var(--ui-text-muted, #9aa0a6));
}

.bench-note {
  display: block;
  padding: 0.85rem 1rem;
  font-size: 0.85rem;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.35));
  border-radius: 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.55));
}

.bench-note code {
  color: var(--ui-primary, #79af43);
}

.bench-note--muted {
  color: var(--ui-text-muted, #9aa0a6);
  border-style: dashed;
}

.bench-section {
  margin-bottom: 1.5rem;
}

.bench-caption {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ui-primary, #79af43);
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.35));
  border-bottom: none;
  border-radius: 0.4rem 0.4rem 0 0;
  background: rgba(138, 168, 94, 0.08);
}

.bench-scroll {
  overflow-x: auto;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.35));
  border-radius: 0 0 0.4rem 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.55));
}

.bench-agg-hint {
  margin-left: auto;
  font-size: 0.66rem;
  font-weight: 400;
  text-transform: lowercase;
  letter-spacing: 0.02em;
  color: var(--ui-text-muted, #9aa0a6);
}

/* Aggregated rows are a read-only summary — no hover detail panel. */
.bench-row--agg {
  cursor: default;
}

.bench-row--overall {
  font-weight: 600;
  border-top: 1px solid rgba(138, 168, 94, 0.3);
}

.bench-row--overall .bench-cell {
  color: var(--ui-text-highlighted, #e8eaed);
}

.bench-grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.bench-col--case {
  width: 16%;
  min-width: 8rem;
}

.bench-head {
  background: rgba(138, 168, 94, 0.06);
}

.bench-th {
  padding: 0.35rem 0.7rem;
  font-size: 0.66rem;
  font-weight: 600;
  text-align: right;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted, #9aa0a6);
  border-bottom: 1px solid rgba(138, 168, 94, 0.25);
  overflow-wrap: anywhere;
}

/* Competitor column header — centered + bright, same look as the type-cost table. */
.bench-th--comp {
  text-align: center;
  color: var(--ui-text-highlighted, #e8eaed);
  border-left: 1px solid rgba(138, 168, 94, 0.18);
}

.bench-th-name {
  display: block;
}

/* installed library version under the column name — dim + monospace-ish */
.bench-th-version {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.72em;
  font-weight: 400;
  color: var(--ui-text-dimmed, #9aa0a6);
  font-variant-numeric: tabular-nums;
}

.bench-th--comp .bench-tag {
  margin-top: 0.2rem;
  font-weight: 600;
}

/* Run-environment line above the tables — quiet, terminal-style. */
.bench-runinfo {
  margin: 0 0 0.85rem;
  font-size: 0.7rem;
  color: var(--ui-text-muted, #b3b8bd);
}
.bench-runinfo .bench-prompt {
  margin-right: 0.4rem;
  opacity: 0.7;
}
.bench-runinfo-text {
  font-variant-numeric: tabular-nums;
}

.bench-th--case {
  text-align: left;
}

.bench-row {
  cursor: pointer;
  outline: none;
  transition: background 0.12s ease;
  border-left: 3px solid transparent;
}

.bench-row:hover,
.bench-row:focus-visible,
.bench-row--active {
  background: rgba(138, 168, 94, 0.1);
  border-left-color: var(--ui-primary, #79af43);
}

.bench-cell {
  padding: 0.5rem 0.7rem;
  font-size: 0.76rem;
  text-align: right;
  border-bottom: 1px solid rgba(138, 168, 94, 0.12);
  white-space: nowrap;
}

.bench-cell--case {
  text-align: left;
  color: var(--ui-text-highlighted, #e8eaed);
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Subtle separator between competitor columns. The combined value is centered so
   the valid number sits centered and the invalid annotation hangs off its corner. */
.bench-val {
  border-left: 1px solid rgba(138, 168, 94, 0.12);
  text-align: center;
}

.bench-val--ok {
  color: var(--ui-primary, #79af43);
}

.bench-val--fail {
  color: #e0533d;
}

.bench-val--na,
.bench-val--none {
  color: var(--ui-text-muted, #9aa0a6);
}

/* Row heatmap: --rank (0 = worst in the row → 1 = best) drives one hsl ramp
   (red → amber → green), dampened upstream so near-ties stay neutral. Only ok cells
   are ranked; two modes chosen from the legend. */
.bench-color-tint .bench-val--ranked {
  background: hsl(calc(var(--rank) * 130deg) 55% 48% / 0.2);
}

.bench-color-tint .bench-val--ranked .bench-val-primary {
  color: var(--ui-text-highlighted, #e8eaed);
}

.bench-color-text .bench-val--ranked .bench-val-primary {
  color: hsl(calc(var(--rank) * 130deg) 58% 68%);
}

/* Light theme: darker numbers so the ramp stays legible on the light surface. */
:root.light .bench-color-text .bench-val--ranked .bench-val-primary {
  color: hsl(calc(var(--rank) * 130deg) 55% 38%);
}

/* Combined cell — valid (accept) is the centered headline (inherits the cell's
   ok/fail color); invalid (reject) hangs off its bottom-right corner, smaller +
   dimmed. Both colors are theme tokens (Nuxt UI) so they adapt to light + dark. */
.bench-val-wrap {
  position: relative;
  display: inline-block;
}

.bench-val-primary {
  font-variant-numeric: tabular-nums;
}

.bench-val-secondary {
  position: absolute;
  top: 0.85em;
  left: 100%;
  margin-left: 0.1rem;
  font-size: 0.65rem;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-dimmed, var(--ui-text-muted, #9aa0a6));
}
</style>
