<script setup lang="ts">
import {reactive, ref, onMounted} from 'vue';

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

const props = defineProps<{
  /** bench slug — fetched from /bench-data/<bench>/index.json */
  bench: string;
}>();

const index = ref<BenchIndex | null>(null);
const indexState = ref<'loading' | 'ready' | 'missing'>('loading');

const details = reactive<Record<string, {state: 'loading' | 'ready' | 'error'; data?: BenchCaseDetail}>>({});
const activated = reactive<Record<string, boolean>>({});

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

async function activate(key: string) {
  activated[key] = true;
  if (details[key]) return;
  details[key] = {state: 'loading'};
  try {
    const res = await fetch(`/bench-data/${props.bench}/${key}.json`);
    if (!res.ok) {
      details[key] = {state: 'error'};
      return;
    }
    details[key] = {state: 'ready', data: (await res.json()) as BenchCaseDetail};
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
            <thead>
              <tr class="bench-head">
                <th class="bench-th bench-th--case">case</th>
                <th v-for="comp in index.competitors" :key="comp" class="bench-th">{{ comp }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="kase in section.cases" :key="kase.key">
                <tr
                  class="bench-row"
                  :class="{'bench-row--open': activated[kase.key]}"
                  tabindex="0"
                  :aria-expanded="!!activated[kase.key]"
                  @mouseenter="activate(kase.key)"
                  @focus="activate(kase.key)"
                  @click="activate(kase.key)"
                  @keydown.enter.prevent="activate(kase.key)"
                  @keydown.space.prevent="activate(kase.key)"
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

                <tr v-if="activated[kase.key]" :key="`${kase.key}-panel`" class="bench-panel-row">
                  <td class="bench-panel-cell" :colspan="index.competitors.length + 1">
                    <div class="bench-panel">
                      <template v-if="details[kase.key]?.state === 'loading'">
                        <div class="bench-note bench-note--muted">
                          <span class="bench-prompt">$</span> loading sources&hellip;
                        </div>
                      </template>

                      <template v-else-if="details[kase.key]?.state === 'error'">
                        <div class="bench-note bench-note--muted">
                          <span class="bench-prompt">$</span> could not load competitor sources.
                        </div>
                      </template>

                      <template v-else-if="details[kase.key]?.data as BenchCaseDetail | undefined">
                        <div
                          v-for="competitor in (details[kase.key]!.data as BenchCaseDetail).competitors"
                          :key="competitor.name"
                          class="bench-block"
                        >
                          <span class="bench-label">{{ competitor.name }}</span>
                          <pre class="bench-code"><code>{{ competitor.source }}</code></pre>
                        </div>
                      </template>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
    </template>
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
  background: rgba(20, 20, 20, 0.55);
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
  background: rgba(20, 20, 20, 0.55);
}

.bench-grid {
  width: 100%;
  border-collapse: collapse;
}

.bench-head {
  background: rgba(138, 168, 94, 0.06);
}

.bench-th {
  padding: 0.4rem 0.8rem;
  font-size: 0.68rem;
  font-weight: 600;
  text-align: right;
  text-transform: lowercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted, #9aa0a6);
  border-bottom: 1px solid rgba(138, 168, 94, 0.25);
  white-space: nowrap;
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
.bench-row--open {
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

.bench-panel-row > .bench-panel-cell {
  padding: 0;
  border-bottom: 1px solid rgba(138, 168, 94, 0.12);
}

.bench-panel {
  padding: 0.6rem 0.9rem 0.9rem 1.1rem;
  border-left: 3px solid var(--ui-primary, #79af43);
  background: rgba(0, 0, 0, 0.25);
}

.bench-block + .bench-block {
  margin-top: 0.6rem;
}

.bench-label {
  display: block;
  margin-bottom: 0.2rem;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-primary, #79af43);
}

.bench-code {
  margin: 0;
  padding: 0.55rem 0.7rem;
  overflow-x: auto;
  font-size: 0.74rem;
  line-height: 1.4;
  color: var(--ui-text, #d6d8db);
  background: rgba(10, 10, 10, 0.6);
  border: 1px solid rgba(138, 168, 94, 0.18);
  border-radius: 0.3rem;
}

.bench-code code {
  font-family: inherit;
  white-space: pre;
}
</style>
