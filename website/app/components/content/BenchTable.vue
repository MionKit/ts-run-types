<script setup lang="ts">
import {reactive, ref, computed, onMounted, onBeforeUnmount} from 'vue';

interface CaseResult {
  validateOpsSec?: number;
  invalidOpsSec?: number;
  status?: 'ok' | 'fail' | 'not-supported';
}

interface BenchCase {
  key: string;
  title: string;
  results: Record<string, CaseResult>;
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
  metricLabel?: string;
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

const props = defineProps<{
  /** bench slug — fetched from /bench-data/<bench>/index.json */
  bench: string;
}>();

const {highlight} = useCodeHighlighter();

const index = ref<BenchIndex | null>(null);
const indexState = ref<'loading' | 'ready' | 'missing'>('loading');

const details = reactive<Record<string, DetailEntry>>({});
/** the single row whose competitor sources are shown in the fixed panel */
const active = ref<{key: string; title: string} | null>(null);

const activeDetail = computed<DetailEntry | undefined>(() => (active.value ? details[active.value.key] : undefined));

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
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

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

function close() {
  active.value = null;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}

async function activate(key: string, title: string) {
  active.value = {key, title};
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
 *  typecost bench. */
function formatValue(value: number, unit: BenchIndex['unit']): string {
  const suffix = unit === 'count' ? '' : '/s';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M${suffix}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k${suffix}`;
  return `${Math.round(value)}${suffix}`;
}

/** Cell text for a competitor on a case — number, em-dash, FAIL or n-a. */
function cellText(result: CaseResult | undefined, unit: BenchIndex['unit']): string {
  if (!result) return '—';
  if (result.status === 'fail') return 'FAIL';
  if (result.status === 'not-supported') return 'n-a';
  if (typeof result.validateOpsSec === 'number') return formatValue(result.validateOpsSec, unit);
  return '—';
}

function cellClass(result: CaseResult | undefined): string {
  if (!result) return 'bench-val--none';
  if (result.status === 'fail') return 'bench-val--fail';
  if (result.status === 'not-supported') return 'bench-val--na';
  if (typeof result.validateOpsSec === 'number') return 'bench-val--ok';
  return 'bench-val--none';
}
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
      <div v-if="index.metricLabel" class="bench-metric">
        <span class="bench-prompt">#</span> {{ index.metricLabel }}
      </div>
      <section v-for="section in index.sections" :key="section.key" class="bench-section">
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
                <th v-for="comp in index.competitors" :key="comp" class="bench-th">{{ comp }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="kase in section.cases"
                :key="kase.key"
                class="bench-row"
                :class="{'bench-row--active': active?.key === kase.key}"
                tabindex="0"
                @mouseenter="activate(kase.key, kase.title)"
                @focus="activate(kase.key, kase.title)"
                @click="activate(kase.key, kase.title)"
                @keydown.enter.prevent="activate(kase.key, kase.title)"
                @keydown.space.prevent="activate(kase.key, kase.title)"
              >
                <td class="bench-cell bench-cell--case">{{ kase.title }}</td>
                <td
                  v-for="comp in index.competitors"
                  :key="comp"
                  class="bench-cell bench-val"
                  :class="cellClass(kase.results[comp])"
                >
                  {{ cellText(kase.results[comp], index.unit) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- One fixed, sticky detail panel shared by every row. -->
    <Teleport to="body">
      <aside v-if="active" class="bench-panel-fixed" aria-label="Competitor sources for the selected case">
        <header class="bench-panel-head">
          <span class="bench-panel-title"><span class="bench-prompt">$</span> {{ active.title }}</span>
          <button type="button" class="bench-panel-close" aria-label="Close" @click="close">✕</button>
        </header>

        <div class="bench-panel-body">
          <template v-if="activeDetail?.state === 'loading'">
            <div class="bench-note bench-note--muted">
              <span class="bench-prompt">$</span> loading sources&hellip;
            </div>
          </template>

          <template v-else-if="activeDetail?.state === 'error'">
            <div class="bench-note bench-note--muted">
              <span class="bench-prompt">$</span> could not load competitor sources.
            </div>
          </template>

          <template v-else-if="activeDetail?.data">
            <div
              v-for="(competitor, i) in activeDetail.data.competitors"
              :key="competitor.name"
              class="bench-block"
            >
              <span class="bench-label">{{ competitor.name }}</span>
              <div v-if="activeDetail.html?.[i]" class="bench-code" v-html="activeDetail.html[i]" />
              <pre v-else class="bench-code bench-code--plain"><code>{{ competitor.source }}</code></pre>
            </div>
          </template>
        </div>
      </aside>
    </Teleport>
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

.bench-metric {
  margin: 0 0 0.6rem;
  font-size: 0.74rem;
  color: var(--ui-text-muted, #9aa0a6);
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
  overflow: hidden;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.35));
  border-radius: 0 0 0.4rem 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.55));
}

.bench-grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.bench-col--case {
  width: 22%;
}

.bench-head {
  background: rgba(138, 168, 94, 0.06);
}

.bench-th {
  padding: 0.4rem 0.8rem;
  font-size: 0.68rem;
  font-weight: 600;
  text-align: right;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted, #9aa0a6);
  border-bottom: 1px solid rgba(138, 168, 94, 0.25);
  overflow-wrap: anywhere;
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
  padding: 0.5rem 0.8rem;
  font-size: 0.78rem;
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

/* Fixed, sticky detail panel — bottom-right, shared across every row. */
.bench-panel-fixed {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 60;
  display: flex;
  flex-direction: column;
  width: min(640px, calc(100vw - 2rem));
  max-height: 74vh;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: var(--rt-panel, rgba(12, 12, 14, 0.97));
  border: 1px solid var(--ui-primary, #79af43);
  border-radius: 0.5rem;
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}

.bench-panel-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.5rem 0.55rem 0.85rem;
  border-bottom: 1px solid rgba(138, 168, 94, 0.25);
}

.bench-panel-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ui-text-highlighted, #e8eaed);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bench-panel-close {
  flex: none;
  padding: 0.15rem 0.45rem;
  font-size: 0.8rem;
  line-height: 1;
  color: var(--ui-text-muted, #9aa0a6);
  cursor: pointer;
  background: transparent;
  border: 1px solid rgba(138, 168, 94, 0.25);
  border-radius: 0.3rem;
}

.bench-panel-close:hover {
  color: var(--ui-text-highlighted, #e8eaed);
  border-color: var(--ui-primary, #79af43);
}

.bench-panel-body {
  padding: 0.75rem 0.85rem 0.9rem;
  overflow: auto;
}

.bench-block + .bench-block {
  margin-top: 0.7rem;
}

.bench-label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-primary, #79af43);
}

.bench-code {
  margin: 0;
  overflow-x: auto;
  font-size: 0.74rem;
  line-height: 1.45;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.18));
  border-radius: 0.3rem;
}

/* Plain-text fallback (highlighter unavailable). */
.bench-code--plain {
  padding: 0.55rem 0.7rem;
  color: var(--ui-text, #d6d8db);
  background: var(--rt-code-bg, rgba(0, 0, 0, 0.45));
}

.bench-code--plain code {
  font-family: inherit;
  white-space: pre;
}

/* Shiki dual-theme output injected via v-html: dark colors ride the inline
   style; the light theme lives in CSS vars, swapped in under :root.light. */
.bench-code :deep(pre.shiki) {
  margin: 0;
  padding: 0.55rem 0.7rem;
  overflow-x: auto;
}

:root.light .bench-code :deep(pre.shiki) {
  background-color: var(--shiki-light-bg) !important;
}

:root.light .bench-code :deep(.shiki),
:root.light .bench-code :deep(.shiki span) {
  color: var(--shiki-light) !important;
}

.bench-code :deep(code) {
  font-family: inherit;
  white-space: pre;
}

@media (max-width: 640px) {
  .bench-panel-fixed {
    right: 0.5rem;
    left: 0.5rem;
    bottom: 0.5rem;
    width: auto;
  }
}
</style>
