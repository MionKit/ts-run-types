<script setup lang="ts">
import {reactive, ref, computed, onMounted} from 'vue';

interface SuiteCase {
  key: string;
  title: string;
  description: string;
  notes: string[];
}

interface SuiteSection {
  key: string;
  label: string;
  cases: SuiteCase[];
}

interface SuiteIndex {
  suite: string;
  label: string;
  sections: SuiteSection[];
}

interface CaseDetail {
  section: string;
  key: string;
  title: string;
  description: string;
  notes: string[];
  pureType: string;
  schema: string;
  generated: string;
}

interface DetailHtml {
  pureType: string;
  schema: string;
  generated: string;
}

interface DetailEntry {
  state: 'loading' | 'ready' | 'error';
  data?: CaseDetail;
  html?: DetailHtml;
}

const props = defineProps<{
  /** suite slug — fetched from /suite-data/<suite>/index.json */
  suite: string;
}>();

const {highlight} = useCodeHighlighter();

const index = ref<SuiteIndex | null>(null);
const indexState = ref<'loading' | 'ready' | 'missing'>('loading');

/** lazy-loaded per-case detail, keyed by `${section}__${key}` */
const details = reactive<Record<string, DetailEntry>>({});

function rowId(section: string, key: string): string {
  return `${section}__${key}`;
}
function rowItem(section: string, key: string, title: string) {
  return {id: rowId(section, key), title};
}

// Shared hover-preview / click-to-pin panel behavior (see useDetailPanel).
const {active, pinned, close, preview, leave, pin, panelEnter, panelLeave} = useDetailPanel<{id: string; title: string}>(loadDetail);

const activeDetail = computed<DetailEntry | undefined>(() => (active.value ? details[active.value.id] : undefined));
const panelState = computed<'loading' | 'ready' | 'error'>(() => activeDetail.value?.state ?? 'loading');

/** Detail-panel columns — Notes (optional), Pure type, Schema (optional), Generated code. */
const panelColumns = computed(() => {
  const entry = activeDetail.value;
  if (!entry || entry.state !== 'ready' || !entry.data) return [];
  const cols: Array<{label: string; html?: string; plain?: string; notes?: string[]; narrow?: boolean}> = [];
  if (entry.data.notes.length) cols.push({label: 'Notes', notes: entry.data.notes, narrow: true});
  cols.push({label: 'Pure type', html: entry.html?.pureType, plain: entry.data.pureType});
  if (entry.data.schema) cols.push({label: 'Schema', html: entry.html?.schema, plain: entry.data.schema});
  cols.push({label: 'Generated code', html: entry.html?.generated, plain: entry.data.generated});
  return cols;
});

/** REALWORLD section first (when present), then the rest in their original order. */
const orderedSections = computed<SuiteSection[]>(() => {
  if (!index.value) return [];
  const realworld = index.value.sections.filter((section) => section.key === 'REALWORLD');
  const rest = index.value.sections.filter((section) => section.key !== 'REALWORLD');
  return [...realworld, ...rest];
});

onMounted(async () => {
  try {
    const res = await fetch(`/suite-data/${props.suite}/index.json`);
    if (!res.ok) {
      indexState.value = 'missing';
      return;
    }
    index.value = (await res.json()) as SuiteIndex;
    indexState.value = 'ready';
  } catch {
    indexState.value = 'missing';
  }
});

/** Lazy-fetch + highlight a case's detail once, keyed by its row id. */
async function loadDetail(item: {id: string; title: string}) {
  const id = item.id;
  if (details[id]) return;
  details[id] = {state: 'loading'};
  try {
    const res = await fetch(`/suite-data/${props.suite}/${id}.json`);
    if (!res.ok) {
      details[id] = {state: 'error'};
      return;
    }
    const data = (await res.json()) as CaseDetail;
    details[id] = {state: 'ready', data};
    const [pureType, schema, generated] = await Promise.all([
      highlight(data.pureType, 'ts'),
      data.schema ? highlight(data.schema, 'ts') : Promise.resolve(''),
      highlight(data.generated, 'js'),
    ]);
    const current = details[id];
    if (current && current.state === 'ready') current.html = {pureType, schema, generated};
  } catch {
    details[id] = {state: 'error'};
  }
}
</script>

<template>
  <div class="suite-table">
    <div v-if="indexState === 'loading'" class="suite-note suite-note--muted">
      <span class="suite-prompt">$</span> loading suite&hellip;
    </div>

    <div v-else-if="indexState === 'missing'" class="suite-note">
      <span class="suite-prompt">$</span> Suite data not generated yet — run
      <code>pnpm run gen:suite-docs</code>.
    </div>

    <template v-else-if="index">
      <div class="suite-legend">
        <span class="suite-legend-note">hover any row for its type, schema, and generated code</span>
        <span class="suite-legend-note"><span class="suite-has-notes">&#9888;</span> marks cases with notes worth reading</span>
      </div>

      <section v-for="section in orderedSections" :key="section.key" class="suite-section">
        <header class="suite-caption">
          <span class="suite-prompt">&gt;</span> {{ section.label }}
          <span class="suite-count">{{ section.cases.length }}</span>
        </header>

        <div class="suite-scroll">
          <table class="suite-grid">
            <colgroup>
              <col class="suite-col--name" />
              <col class="suite-col--desc" />
            </colgroup>
            <thead>
              <tr class="suite-head">
                <th class="suite-th">case</th>
                <th class="suite-th">description</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="kase in section.cases"
                :key="kase.key"
                class="suite-row"
                :class="{'suite-row--active': active?.id === rowId(section.key, kase.key)}"
                tabindex="0"
                @mouseenter="preview(rowItem(section.key, kase.key, kase.title))"
                @mouseleave="leave()"
                @focus="preview(rowItem(section.key, kase.key, kase.title))"
                @blur="leave()"
                @click="pin(rowItem(section.key, kase.key, kase.title))"
                @keydown.enter.prevent="pin(rowItem(section.key, kase.key, kase.title))"
                @keydown.space.prevent="pin(rowItem(section.key, kase.key, kase.title))"
              >
                <td class="suite-cell suite-cell--name">
                  <span class="suite-title">{{ kase.title }}</span>
                </td>
                <td class="suite-cell suite-cell--desc">
                  <span v-if="kase.description">{{ kase.description }}</span>
                  <span v-else class="suite-dash">—</span>
                  <span v-if="kase.notes.length" class="suite-has-notes" title="Has notes — hover to read">⚠</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
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
.suite-table {
  margin: 1.5rem 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.suite-prompt {
  color: var(--ui-primary, #79af43);
  user-select: none;
}

.suite-note {
  display: block;
  padding: 0.85rem 1rem;
  font-size: 0.85rem;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.35));
  border-radius: 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.55));
}

.suite-note code {
  color: var(--ui-primary, #79af43);
}

.suite-note--muted {
  color: var(--ui-text-muted, #9aa0a6);
  border-style: dashed;
}

/* How-to-read box at the top of the table (mirrors the benchmark info section). */
.suite-legend {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin: 0 0 1.25rem;
  padding: 0.55rem 0.85rem;
  font-size: 0.74rem;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.25));
  border-radius: 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.4));
}

.suite-legend-note {
  color: var(--ui-text-muted, #9aa0a6);
  line-height: 1.4;
}

.suite-section {
  margin-bottom: 1.5rem;
}

.suite-caption {
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

.suite-count {
  margin-left: auto;
  padding: 0 0.45rem;
  font-size: 0.7rem;
  color: var(--ui-text-muted, #9aa0a6);
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.25));
  border-radius: 1rem;
}

.suite-scroll {
  overflow: hidden;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.35));
  border-radius: 0 0 0.4rem 0.4rem;
  background: var(--rt-surface, rgba(20, 20, 20, 0.55));
}

/* Fixed layout + wrapping cells = the table always fits its column, no sideways scroll. */
.suite-grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.suite-col--name {
  width: 32%;
}

.suite-col--desc {
  width: 68%;
}

.suite-head {
  background: rgba(138, 168, 94, 0.05);
}

.suite-th {
  padding: 0.35rem 0.9rem;
  font-size: 0.66rem;
  font-weight: 600;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ui-text-muted, #9aa0a6);
  border-bottom: 1px solid rgba(138, 168, 94, 0.2);
}

.suite-row {
  cursor: pointer;
  outline: none;
  transition: background 0.12s ease;
}

.suite-row:hover,
.suite-row:focus-visible,
.suite-row--active {
  background: rgba(138, 168, 94, 0.1);
}

.suite-cell {
  padding: 0.5rem 0.9rem;
  border-bottom: 1px solid rgba(138, 168, 94, 0.12);
  border-left: 3px solid transparent;
  vertical-align: top;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.suite-row:hover .suite-cell--name,
.suite-row:focus-visible .suite-cell--name,
.suite-row--active .suite-cell--name {
  border-left-color: var(--ui-primary, #79af43);
}

.suite-title {
  color: var(--ui-text-highlighted, #e8eaed);
  font-size: 0.8rem;
}

.suite-cell--desc {
  font-size: 0.74rem;
  line-height: 1.4;
  color: var(--ui-text-muted, #9aa0a6);
}

/* ⚠ marker on a description cell signalling the row carries notes (read on hover). */
.suite-has-notes {
  margin-left: 0.4rem;
  color: var(--rt-note, #c8b072);
  cursor: help;
}

.suite-dash {
  color: rgba(154, 160, 166, 0.5);
}
</style>
