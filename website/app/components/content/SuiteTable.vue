<script setup lang="ts">
import {reactive, ref, onMounted} from 'vue';

interface SuiteCase {
  key: string;
  title: string;
  description: string;
  notes: boolean;
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

const props = defineProps<{
  /** suite slug — fetched from /suite-data/<suite>/index.json */
  suite: string;
}>();

const index = ref<SuiteIndex | null>(null);
const indexState = ref<'loading' | 'ready' | 'missing'>('loading');

/** lazy-loaded per-case detail, keyed by `${section}__${key}` */
const details = reactive<Record<string, {state: 'loading' | 'ready' | 'error'; data?: CaseDetail}>>({});
/** which rows the user has activated (hover / click / focus) at least once */
const activated = reactive<Record<string, boolean>>({});

function rowId(section: string, key: string): string {
  return `${section}__${key}`;
}

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

/** First activation triggers the lazy detail fetch; later activations are cheap. */
async function activate(section: string, key: string) {
  const id = rowId(section, key);
  activated[id] = true;
  if (details[id]) return;
  details[id] = {state: 'loading'};
  try {
    const res = await fetch(`/suite-data/${props.suite}/${id}.json`);
    if (!res.ok) {
      details[id] = {state: 'error'};
      return;
    }
    details[id] = {state: 'ready', data: (await res.json()) as CaseDetail};
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
            <tbody>
              <template v-for="kase in section.cases" :key="kase.key">
                <tr
                  class="suite-row"
                  :class="{'suite-row--open': activated[rowId(section.key, kase.key)]}"
                  tabindex="0"
                  :aria-expanded="!!activated[rowId(section.key, kase.key)]"
                  @mouseenter="activate(section.key, kase.key)"
                  @focus="activate(section.key, kase.key)"
                  @click="activate(section.key, kase.key)"
                  @keydown.enter.prevent="activate(section.key, kase.key)"
                  @keydown.space.prevent="activate(section.key, kase.key)"
                >
                  <td class="suite-cell">
                    <span class="suite-title">{{ kase.title }}</span>
                    <span v-if="kase.notes" class="suite-warn" title="Has notes">⚠</span>
                    <span v-if="kase.description" class="suite-desc">{{ kase.description }}</span>
                  </td>
                </tr>

                <tr
                  v-if="activated[rowId(section.key, kase.key)]"
                  :key="`${kase.key}-panel`"
                  class="suite-panel-row"
                >
                  <td class="suite-panel-cell">
                    <div class="suite-panel">
                      <template v-if="details[rowId(section.key, kase.key)]?.state === 'loading'">
                        <div class="suite-note suite-note--muted">
                          <span class="suite-prompt">$</span> loading case&hellip;
                        </div>
                      </template>

                      <template v-else-if="details[rowId(section.key, kase.key)]?.state === 'error'">
                        <div class="suite-note suite-note--muted">
                          <span class="suite-prompt">$</span> could not load this case.
                        </div>
                      </template>

                      <template v-else-if="details[rowId(section.key, kase.key)]?.data as CaseDetail | undefined">
                        <div
                          v-if="(details[rowId(section.key, kase.key)]!.data as CaseDetail).notes.length"
                          class="suite-notes"
                        >
                          <span
                            v-for="(note, i) in (details[rowId(section.key, kase.key)]!.data as CaseDetail).notes"
                            :key="i"
                            class="suite-note-line"
                          >
                            <span class="suite-bullet">•</span> {{ note }}
                          </span>
                        </div>

                        <div class="suite-block">
                          <span class="suite-label">Pure type</span>
                          <pre
                            class="suite-code"
                          ><code>{{ (details[rowId(section.key, kase.key)]!.data as CaseDetail).pureType }}</code></pre>
                        </div>

                        <div
                          v-if="(details[rowId(section.key, kase.key)]!.data as CaseDetail).schema"
                          class="suite-block"
                        >
                          <span class="suite-label">Schema</span>
                          <pre
                            class="suite-code"
                          ><code>{{ (details[rowId(section.key, kase.key)]!.data as CaseDetail).schema }}</code></pre>
                        </div>

                        <div class="suite-block">
                          <span class="suite-label">Generated code</span>
                          <pre
                            class="suite-code"
                          ><code>{{ (details[rowId(section.key, kase.key)]!.data as CaseDetail).generated }}</code></pre>
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
  background: rgba(20, 20, 20, 0.55);
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
  overflow-x: auto;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.35));
  border-radius: 0 0 0.4rem 0.4rem;
  background: rgba(20, 20, 20, 0.55);
}

.suite-grid {
  width: 100%;
  border-collapse: collapse;
}

.suite-row {
  cursor: pointer;
  outline: none;
  transition: background 0.12s ease;
  border-left: 3px solid transparent;
}

.suite-row:hover,
.suite-row:focus-visible,
.suite-row--open {
  background: rgba(138, 168, 94, 0.1);
  border-left-color: var(--ui-primary, #79af43);
}

.suite-cell {
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid rgba(138, 168, 94, 0.12);
  vertical-align: baseline;
  white-space: nowrap;
}

.suite-title {
  color: var(--ui-text-highlighted, #e8eaed);
  font-size: 0.82rem;
}

.suite-warn {
  margin-left: 0.4rem;
  color: #e0a83d;
  font-size: 0.8rem;
}

.suite-desc {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.72rem;
  color: var(--ui-text-muted, #9aa0a6);
  white-space: normal;
}

.suite-panel-row > .suite-panel-cell {
  padding: 0;
  border-bottom: 1px solid rgba(138, 168, 94, 0.12);
}

.suite-panel {
  padding: 0.6rem 0.9rem 0.9rem 1.1rem;
  border-left: 3px solid var(--ui-primary, #79af43);
  background: rgba(0, 0, 0, 0.25);
}

.suite-notes {
  margin-bottom: 0.6rem;
}

.suite-note-line {
  display: block;
  font-size: 0.74rem;
  line-height: 1.35;
  color: var(--ui-text-muted, #9aa0a6);
}

.suite-bullet {
  color: var(--ui-primary, #79af43);
}

.suite-block + .suite-block {
  margin-top: 0.6rem;
}

.suite-label {
  display: block;
  margin-bottom: 0.2rem;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-primary, #79af43);
}

.suite-code {
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

.suite-code code {
  font-family: inherit;
  white-space: pre;
}
</style>
