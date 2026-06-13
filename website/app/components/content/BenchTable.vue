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
  sections: BenchSection[];
}

interface BenchCompetitorSource {
  name: string;
  source: string;
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

const details = reactive<Record<string, DetailEntry>>({});

function rowItem(key: string, title: string) {
  return {key, title};
}

// Shared hover-preview / click-to-pin panel behavior (see useDetailPanel).
const {active, pinned, close, preview, leave, pin, panelEnter, panelLeave} = useDetailPanel<{key: string; title: string}>(loadDetail);

const activeDetail = computed<DetailEntry | undefined>(() => (active.value ? details[active.value.key] : undefined));
const panelState = computed<'loading' | 'ready' | 'error'>(() => activeDetail.value?.state ?? 'loading');

/** Detail-panel columns — one per competitor, in column order. */
const panelColumns = computed(() => {
  const entry = activeDetail.value;
  if (!entry || entry.state !== 'ready' || !entry.data) return [];
  return entry.data.competitors.map((competitor, i) => ({
    label: competitor.name,
    html: entry.html?.[i],
    plain: competitor.source,
  }));
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
    const html = await Promise.all(data.competitors.map((competitor) => highlight(competitor.source, 'ts')));
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
  // null geomean = the competitor had no usable value in this category (aggValue
  // already collapses an all-zero category to 0), so it's n-a — same as a cell.
  if (!valid && !invalid) return {cls: 'bench-val--na', valid: 'n-a', invalid: ''};
  return {cls: 'bench-val--ok', valid: valid || '—', invalid};
}

/** One combined cell per competitor, in column order — computed once per row. */
function sectionCells(kase: BenchCase, metricKey: string): CombinedCell[] {
  return index.value ? index.value.competitors.map((comp) => combinedCell(kase, metricKey, comp)) : [];
}

function aggCells(row: AggRow): CombinedCell[] {
  return index.value ? index.value.competitors.map((comp) => combinedAggCell(row.values[comp])) : [];
}

/** Geometric mean of the positive values — outlier-resistant summary across cases. */
function geomean(values: number[]): number | null {
  const positive = values.filter((value) => typeof value === 'number' && value > 0);
  if (positive.length === 0) return null;
  return Math.exp(positive.reduce((acc, value) => acc + Math.log(value), 0) / positive.length);
}

/** Aggregate one (metric, competitor, path) across cases: the geometric mean of the
 *  positive values, OR 0 when the competitor DID measure the category but every value
 *  was 0 (a real "all free" result — e.g. a typecost shape that costs zero
 *  instantiations), OR null when there's genuinely no data (renders as n-a / —). */
function aggValue(cases: BenchCase[], metricKey: string, comp: string, path: Path): number | null {
  const positive: number[] = [];
  let measured = false;
  for (const kase of cases) {
    const result = kase.results[comp]?.[metricKey];
    if (result && result.status !== 'fail' && result.status !== 'not-supported' && typeof result[path] === 'number') {
      measured = true;
      if (result[path]! > 0) positive.push(result[path]!);
    }
  }
  const mean = geomean(positive);
  if (mean != null) return mean;
  return measured ? 0 : null;
}

/** Per-category + Overall geometric-mean summary for one metric. */
function aggregateFor(metricKey: string): AggRow[] {
  if (!index.value) return [];
  const competitors = index.value.competitors;
  const rows: AggRow[] = [];
  const allCases: BenchCase[] = [];
  for (const section of orderedSections.value) {
    allCases.push(...section.cases);
    const values: AggRow['values'] = {};
    for (const comp of competitors) {
      values[comp] = {
        valid: aggValue(section.cases, metricKey, comp, 'valid'),
        invalid: aggValue(section.cases, metricKey, comp, 'invalid'),
        mixed: aggValue(section.cases, metricKey, comp, 'mixed'),
      };
    }
    rows.push({key: section.key, label: section.label, values});
  }
  const overall: AggRow['values'] = {};
  for (const comp of index.value.competitors) {
    overall[comp] = {
      valid: aggValue(allCases, metricKey, comp, 'valid'),
      invalid: aggValue(allCases, metricKey, comp, 'invalid'),
      mixed: aggValue(allCases, metricKey, comp, 'mixed'),
    };
  }
  rows.push({key: '__overall__', label: 'Overall', values: overall});
  return rows;
}

/** Precomputed aggregates keyed by metric. */
const aggregates = computed<Record<string, AggRow[]>>(() => {
  if (!index.value) return {};
  return Object.fromEntries(index.value.metrics.map((metric) => [metric.key, aggregateFor(metric.key)]));
});
</script>

<template>
  <div class="bench-table">
    <div v-if="indexState === 'loading'" class="bench-note bench-note--muted">
      <span class="bench-prompt">$</span> loading benchmark&hellip;
    </div>

    <div v-else-if="indexState === 'missing'" class="bench-note">
      <span class="bench-prompt">$</span> Benchmark data not generated yet — run
      <code>pnpm run gen:bench-docs</code>.
    </div>

    <template v-else-if="index">
      <!-- How-to-read legend: each cell pairs the valid (accept) headline number with
           the smaller, dimmed invalid (reject) number tucked at its corner. -->
      <div v-if="index.showInvalid" class="bench-legend">
        <span class="bench-legend-sample"><span class="bench-val-wrap"><span class="bench-val-primary bench-val--ok">24M/s</span><span class="bench-val-secondary">47M</span></span></span>
        <span class="bench-legend-note">
          each cell = ops/sec on <span class="bench-legend-valid">valid input</span> (the headline number)
          and, smaller, on <span class="bench-legend-invalid">invalid input</span>
        </span>
      </div>

      <!-- One block per metric, each with its own aggregated summary + per-section
           tables; every cell combines the valid + invalid numbers (see legend above). -->
      <div v-for="metric in displayedMetrics" :key="metric.key" class="bench-metric-block">
        <div class="bench-metric">
          <span class="bench-prompt">#</span> <strong class="bench-metric-name">{{ metric.label }}</strong>
          <span v-if="metric.metricLabel" class="bench-metric-sub">{{ metric.metricLabel }}</span>
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
                  <th v-for="comp in index.competitors" :key="comp" class="bench-th bench-th--comp">{{ comp }}</th>
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
                  <td v-for="(cc, ci) in aggCells(row)" :key="ci" class="bench-cell bench-val" :class="cc.cls">
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
                  <th v-for="comp in index.competitors" :key="comp" class="bench-th bench-th--comp">{{ comp }}</th>
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
                  <td v-for="(cc, ci) in sectionCells(kase, metric.key)" :key="ci" class="bench-cell bench-val" :class="cc.cls">
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
  margin: 0 0 0.7rem;
  font-size: 0.78rem;
  color: var(--ui-text-muted, #9aa0a6);
}

.bench-metric-name {
  color: var(--ui-text-highlighted, #e8eaed);
  font-size: 0.92rem;
}

.bench-metric-sub {
  margin-left: 0.5rem;
}

/* How-to-read legend for the combined valid/invalid cell. */
.bench-legend {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 0 0 1.25rem;
  padding: 0.5rem 0.85rem;
  font-size: 0.74rem;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.25));
  border-radius: 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.4));
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
