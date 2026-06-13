<script setup lang="ts">
// Full-width detail panel docked at the bottom of the viewport, shared by the
// suite + benchmark tables (driven by useDetailPanel). Presentational only: the
// parent owns the active/pinned state and passes the columns to render. Sections
// lay out as side-by-side columns whose code blocks scroll independently; on
// narrow screens the columns stack and the panel covers the page minus a margin.

interface PanelColumn {
  /** Section / competitor label (e.g. 'Pure type', 'ts-go-run-types'). */
  label: string;
  /** Highlighted HTML to inject (shiki); falls back to `plain` when absent. */
  html?: string;
  /** Plain-text code (used when `html` is empty / highlighter unavailable). */
  plain?: string;
  /** Bullet notes instead of a code block (the suite's Notes column). */
  notes?: string[];
  /** Render this column narrower (e.g. the Notes column). */
  narrow?: boolean;
}

defineProps<{
  open: boolean;
  pinned: boolean;
  title: string;
  state: 'loading' | 'ready' | 'error';
  columns: PanelColumn[];
}>();

defineEmits<{close: []; panelenter: []; panelleave: []}>();
</script>

<template>
  <Teleport to="body">
    <aside
      v-if="open"
      class="detail-panel"
      :class="{'detail-panel--pinned': pinned}"
      :aria-label="title"
      @mouseenter="$emit('panelenter')"
      @mouseleave="$emit('panelleave')"
    >
      <header class="detail-panel-head">
        <span class="detail-panel-title"><span class="detail-prompt">$</span> {{ title }}</span>
        <span class="detail-panel-hint">{{ pinned ? 'pinned — click a row or ✕ to change' : 'hover preview — click to pin' }}</span>
        <button type="button" class="detail-panel-close" aria-label="Close" @click="$emit('close')">✕</button>
      </header>

      <div v-if="state === 'loading'" class="detail-panel-msg">
        <span class="detail-prompt">$</span> loading&hellip;
      </div>
      <div v-else-if="state === 'error'" class="detail-panel-msg">
        <span class="detail-prompt">$</span> could not load.
      </div>
      <div v-else class="detail-panel-cols">
        <div v-for="(col, i) in columns" :key="i" class="detail-panel-col" :class="{'detail-panel-col--narrow': col.narrow}">
          <span class="detail-panel-label">{{ col.label }}</span>
          <ul v-if="col.notes" class="detail-panel-notes">
            <li v-for="(note, j) in col.notes" :key="j" class="detail-panel-note">
              <span class="detail-panel-bullet">•</span> {{ note }}
            </li>
          </ul>
          <div v-else-if="col.html" class="detail-panel-code" v-html="col.html" />
          <pre v-else class="detail-panel-code detail-panel-code--plain"><code>{{ col.plain }}</code></pre>
        </div>
      </div>
    </aside>
  </Teleport>
</template>

<style scoped>
.detail-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  max-height: 40vh;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: var(--rt-panel, rgba(12, 12, 14, 0.97));
  border-top: 2px solid var(--ui-primary, #79af43);
  box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.detail-prompt {
  color: var(--ui-primary, #79af43);
  user-select: none;
}

.detail-panel-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: none;
  padding: 0.5rem 0.75rem 0.5rem 1rem;
  border-bottom: 1px solid rgba(138, 168, 94, 0.25);
}

.detail-panel-title {
  min-width: 0;
  overflow: hidden;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ui-text-highlighted, #e8eaed);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-panel-hint {
  flex: 1;
  min-width: 0;
  font-size: 0.66rem;
  color: var(--ui-text-muted, #9aa0a6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-panel-close {
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

.detail-panel-close:hover {
  color: var(--ui-text-highlighted, #e8eaed);
  border-color: var(--ui-primary, #79af43);
}

.detail-panel-msg {
  padding: 1rem;
  font-size: 0.82rem;
  color: var(--ui-text-muted, #9aa0a6);
}

/* Sections as side-by-side columns; horizontal scroll if they overflow. */
.detail-panel-cols {
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
  padding: 0.8rem 0.95rem 0.95rem;
  overflow-x: auto;
  overflow-y: hidden;
}

.detail-panel-col {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 300px;
  min-height: 0;
}

.detail-panel-col--narrow {
  flex: 0 1 240px;
  min-width: 190px;
}

.detail-panel-label {
  display: block;
  flex: none;
  margin-bottom: 0.3rem;
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-primary, #79af43);
}

/* Code / notes fill their column and scroll on their own when taller than the panel. */
.detail-panel-code,
.detail-panel-notes {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.detail-panel-code {
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.45;
  border: 1px solid var(--ui-border, rgba(138, 168, 94, 0.18));
  border-radius: 0.3rem;
}

.detail-panel-code--plain {
  padding: 0.55rem 0.7rem;
  color: var(--ui-text, #d6d8db);
  background: var(--rt-code-bg, rgba(0, 0, 0, 0.45));
}

.detail-panel-code--plain code {
  font-family: inherit;
  white-space: pre;
}

.detail-panel-notes {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--rt-note, #c8b072);
}

.detail-panel-note + .detail-panel-note {
  margin-top: 0.25rem;
}

.detail-panel-bullet {
  color: var(--ui-primary, #79af43);
}

/* Shiki dual-theme output injected via v-html: dark colors ride the inline style;
   the light theme lives in CSS vars, swapped in under :root.light. The outer
   .detail-panel-code is the scroll container, so the inner pre doesn't scroll.
   min-height: 100% stretches the pre to fill the container when the code is short,
   so the shiki background covers the section top-to-bottom (both themes). */
.detail-panel-code :deep(pre.shiki) {
  box-sizing: border-box;
  min-height: 100%;
  margin: 0;
  padding: 0.55rem 0.7rem;
  overflow: visible;
}

:root.light .detail-panel-code :deep(pre.shiki) {
  background-color: var(--shiki-light-bg) !important;
}

:root.light .detail-panel-code :deep(.shiki),
:root.light .detail-panel-code :deep(.shiki span) {
  color: var(--shiki-light) !important;
}

.detail-panel-code :deep(code) {
  font-family: inherit;
  white-space: pre;
}

/* Narrow screens: the panel covers the page minus a small margin, columns stack. */
@media (max-width: 767px) {
  .detail-panel {
    inset: 0.5rem;
    height: auto;
    border: 2px solid var(--ui-primary, #79af43);
    border-radius: 0.5rem;
  }

  .detail-panel-hint {
    display: none;
  }

  .detail-panel-cols {
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .detail-panel-col,
  .detail-panel-col--narrow {
    flex: none;
    min-width: 0;
  }

  .detail-panel-code {
    flex: none;
    max-height: 45vh;
  }
}
</style>
