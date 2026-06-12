<script setup lang="ts">
import {reactive, ref, computed, onMounted, onBeforeUnmount} from 'vue';

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
/** the single row whose detail is shown in the fixed panel */
const active = ref<{id: string; title: string} | null>(null);

function rowId(section: string, key: string): string {
  return `${section}__${key}`;
}

const activeDetail = computed<DetailEntry | undefined>(() => (active.value ? details[active.value.id] : undefined));

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
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

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

function close() {
  active.value = null;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}

/** Activate a row: show it in the panel and lazy-load + highlight its detail once. */
async function activate(section: string, key: string, title: string) {
  const id = rowId(section, key);
  active.value = {id, title};
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
      <section v-for="section in index.sections" :key="section.key" class="suite-section">
        <header class="suite-caption">
          <span class="suite-prompt">&gt;</span> {{ section.label }}
          <span class="suite-count">{{ section.cases.length }}</span>
        </header>

        <div class="suite-scroll">
          <table class="suite-grid">
            <colgroup>
              <col class="suite-col--name" />
              <col class="suite-col--desc" />
              <col class="suite-col--notes" />
            </colgroup>
            <thead>
              <tr class="suite-head">
                <th class="suite-th">case</th>
                <th class="suite-th">description</th>
                <th class="suite-th">notes</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="kase in section.cases"
                :key="kase.key"
                class="suite-row"
                :class="{'suite-row--active': active?.id === rowId(section.key, kase.key)}"
                tabindex="0"
                @mouseenter="activate(section.key, kase.key, kase.title)"
                @focus="activate(section.key, kase.key, kase.title)"
                @click="activate(section.key, kase.key, kase.title)"
                @keydown.enter.prevent="activate(section.key, kase.key, kase.title)"
                @keydown.space.prevent="activate(section.key, kase.key, kase.title)"
              >
                <td class="suite-cell suite-cell--name">
                  <span class="suite-title">{{ kase.title }}</span>
                </td>
                <td class="suite-cell suite-cell--desc">
                  <span v-if="kase.description">{{ kase.description }}</span>
                  <span v-else class="suite-dash">—</span>
                </td>
                <td class="suite-cell suite-cell--notes">
                  <template v-if="kase.notes.length">
                    <span v-for="(note, i) in kase.notes" :key="i" class="suite-note-line">
                      <span class="suite-bullet">•</span> {{ note }}
                    </span>
                  </template>
                  <span v-else class="suite-dash">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- One fixed, sticky detail panel shared by every row. -->
    <Teleport to="body">
      <aside v-if="active" class="suite-panel-fixed" aria-label="Generated code for the selected case">
        <header class="suite-panel-head">
          <span class="suite-panel-title"><span class="suite-prompt">$</span> {{ active.title }}</span>
          <button type="button" class="suite-panel-close" aria-label="Close" @click="close">✕</button>
        </header>

        <div class="suite-panel-body">
          <template v-if="activeDetail?.state === 'loading'">
            <div class="suite-note suite-note--muted">
              <span class="suite-prompt">$</span> loading case&hellip;
            </div>
          </template>

          <template v-else-if="activeDetail?.state === 'error'">
            <div class="suite-note suite-note--muted">
              <span class="suite-prompt">$</span> could not load this case.
            </div>
          </template>

          <template v-else-if="activeDetail?.data">
            <div class="suite-block">
              <span class="suite-label">Pure type</span>
              <div v-if="activeDetail.html?.pureType" class="suite-code" v-html="activeDetail.html.pureType" />
              <pre v-else class="suite-code suite-code--plain"><code>{{ activeDetail.data.pureType }}</code></pre>
            </div>

            <div v-if="activeDetail.data.schema" class="suite-block">
              <span class="suite-label">Schema</span>
              <div v-if="activeDetail.html?.schema" class="suite-code" v-html="activeDetail.html.schema" />
              <pre v-else class="suite-code suite-code--plain"><code>{{ activeDetail.data.schema }}</code></pre>
            </div>

            <div class="suite-block">
              <span class="suite-label">Generated code</span>
              <div v-if="activeDetail.html?.generated" class="suite-code" v-html="activeDetail.html.generated" />
              <pre v-else class="suite-code suite-code--plain"><code>{{ activeDetail.data.generated }}</code></pre>
            </div>
          </template>
        </div>
      </aside>
    </Teleport>
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
  width: 26%;
}

.suite-col--desc {
  width: 38%;
}

.suite-col--notes {
  width: 36%;
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

.suite-cell--notes {
  font-size: 0.72rem;
  line-height: 1.4;
}

.suite-note-line {
  display: block;
  color: var(--rt-note, #c8b072);
}

.suite-note-line + .suite-note-line {
  margin-top: 0.2rem;
}

.suite-bullet {
  color: var(--ui-primary, #79af43);
}

.suite-dash {
  color: rgba(154, 160, 166, 0.5);
}

/* Fixed, sticky detail panel — bottom-right, shared across every row. */
.suite-panel-fixed {
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

.suite-panel-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.5rem 0.55rem 0.85rem;
  border-bottom: 1px solid rgba(138, 168, 94, 0.25);
}

.suite-panel-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ui-text-highlighted, #e8eaed);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suite-panel-close {
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

.suite-panel-close:hover {
  color: var(--ui-text-highlighted, #e8eaed);
  border-color: var(--ui-primary, #79af43);
}

.suite-panel-body {
  padding: 0.75rem 0.85rem 0.9rem;
  overflow: auto;
}

.suite-block + .suite-block {
  margin-top: 0.7rem;
}

.suite-label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-primary, #79af43);
}

.suite-code {
  margin: 0;
  overflow-x: auto;
  font-size: 0.74rem;
  line-height: 1.45;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.18));
  border-radius: 0.3rem;
}

/* Plain-text fallback (highlighter unavailable). */
.suite-code--plain {
  padding: 0.55rem 0.7rem;
  color: var(--ui-text, #d6d8db);
  background: var(--rt-code-bg, rgba(0, 0, 0, 0.45));
}

.suite-code--plain code {
  font-family: inherit;
  white-space: pre;
}

/* Shiki dual-theme output injected via v-html: dark colors ride the inline
   style; the light theme lives in CSS vars, swapped in under :root.light. */
.suite-code :deep(pre.shiki) {
  margin: 0;
  padding: 0.55rem 0.7rem;
  overflow-x: auto;
}

:root.light .suite-code :deep(pre.shiki) {
  background-color: var(--shiki-light-bg) !important;
}

:root.light .suite-code :deep(.shiki),
:root.light .suite-code :deep(.shiki span) {
  color: var(--shiki-light) !important;
}

.suite-code :deep(code) {
  font-family: inherit;
  white-space: pre;
}

@media (max-width: 640px) {
  .suite-panel-fixed {
    right: 0.5rem;
    left: 0.5rem;
    bottom: 0.5rem;
    width: auto;
  }
}
</style>
