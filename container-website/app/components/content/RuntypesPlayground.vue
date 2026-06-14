<script setup lang="ts">
// RuntypesPlayground — interactive playground that resolves a TypeScript type
// to its RunType graph entirely in the browser. The ts-runtypes resolver (Go +
// tsgo) is compiled to WebAssembly and loaded client-side; the CodeMirror 6
// editor on the left feeds a type string into it and the resolved dump renders
// on the right. No server round-trip, no native binary.
//
// CodeMirror and the WASM runtime are browser-only, so everything initializes
// in onMounted behind import.meta.client — the component renders a placeholder
// during SSR.

import { useRuntypesPlayground, type DumpResult, type Resolver } from '../../composables/useRuntypesPlayground';

const props = withDefaults(
  defineProps<{
    // Initial type expression shown in the editor.
    type?: string;
    // Editor/viewer height (any CSS length).
    height?: string;
  }>(),
  {
    type: '{\n  id: number;\n  name: string;\n  tags: string[];\n  role: "admin" | "user";\n  active?: boolean;\n}',
    height: '420px',
  },
);

const editorHost = ref<HTMLElement | null>(null);
const status = ref('loading resolver…');
const errorMessage = ref('');
const result = ref<DumpResult | null>(null);
const versions = ref<{ version: string; tsgo: string } | null>(null);
const ready = ref(false);

let resolver: Resolver | null = null;
let editorView: { state: { doc: { toString(): string } }; destroy(): void } | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// run resolves the editor's current contents and stores the dump (or an error).
function run() {
  if (!resolver) return;
  const source = editorView ? editorView.state.doc.toString() : props.type;
  const started = performance.now();
  try {
    const dump = resolver.dumpType(source);
    result.value = dump;
    errorMessage.value = '';
    const ms = Math.round(performance.now() - started);
    status.value = `${dump.runTypes.length} node${dump.runTypes.length === 1 ? '' : 's'} · ${ms}ms`;
  } catch (err) {
    result.value = null;
    errorMessage.value = err instanceof Error ? err.message : String(err);
    status.value = 'error';
  }
}

function scheduleRun() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(run, 300);
}

// prettyDump is the JSON shown in the output pane.
const prettyDump = computed(() => {
  if (errorMessage.value) return errorMessage.value;
  if (!result.value) return '';
  return JSON.stringify(
    { rootId: result.value.rootId, nodeCount: result.value.runTypes.length, runTypes: result.value.runTypes },
    null,
    2,
  );
});

onMounted(async () => {
  if (!import.meta.client) return;
  try {
    // Dynamic imports keep CodeMirror out of the SSR bundle.
    const [{ EditorView, basicSetup }, { javascript }, { oneDark }] = await Promise.all([
      import('codemirror'),
      import('@codemirror/lang-javascript'),
      import('@codemirror/theme-one-dark'),
    ]);

    editorView = new EditorView({
      doc: props.type,
      parent: editorHost.value!,
      extensions: [
        basicSetup,
        javascript({ typescript: true }),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) scheduleRun();
        }),
      ],
    }) as unknown as typeof editorView;

    resolver = await useRuntypesPlayground();
    versions.value = resolver.versions;
    ready.value = true;
    run();
  } catch (err) {
    errorMessage.value =
      (err instanceof Error ? err.message : String(err)) +
      '\n\nThe WASM module may not be built yet — run container-website/scripts/build-playground.sh.';
    status.value = 'failed to load';
  }
});

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  editorView?.destroy();
});
</script>

<template>
  <div class="rt-playground" :style="{ '--rt-pg-height': height }">
    <div class="rt-playground__bar">
      <span class="rt-playground__title">RunTypes playground</span>
      <span class="rt-playground__hint">type a TypeScript type, see its RunType dump · runs in WebAssembly</span>
      <span class="rt-playground__spacer" />
      <span v-if="versions" class="rt-playground__meta">tsgo {{ versions.tsgo }}</span>
      <button class="rt-playground__run" :disabled="!ready" @click="run">Resolve</button>
    </div>

    <div class="rt-playground__panes">
      <section class="rt-playground__pane">
        <div class="rt-playground__label">TypeScript type</div>
        <div ref="editorHost" class="rt-playground__editor" />
      </section>
      <section class="rt-playground__pane">
        <div class="rt-playground__label">
          RunType dump
          <span class="rt-playground__status" :class="{ 'is-error': !!errorMessage }">{{ status }}</span>
        </div>
        <pre class="rt-playground__output" :class="{ 'is-error': !!errorMessage }">{{ prettyDump || '…' }}</pre>
      </section>
    </div>
  </div>
</template>

<style scoped>
.rt-playground {
  --rt-pg-border: var(--ui-border, #21262d);
  --rt-pg-bg: var(--ui-bg, #0d1117);
  --rt-pg-muted: var(--ui-text-muted, #8b949e);
  border: 1px solid var(--rt-pg-border);
  border-radius: 10px;
  overflow: hidden;
  margin: 1.25rem 0;
  background: var(--rt-pg-bg);
  font-size: 13px;
}
.rt-playground__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--rt-pg-border);
}
.rt-playground__title { font-weight: 600; }
.rt-playground__hint { color: var(--rt-pg-muted); font-size: 12px; }
.rt-playground__spacer { flex: 1; }
.rt-playground__meta { color: var(--rt-pg-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.rt-playground__run {
  background: var(--ui-primary, #2f8a3b);
  color: #fff;
  border: 0;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}
.rt-playground__run:disabled { opacity: 0.5; cursor: default; }
.rt-playground__panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--rt-pg-border);
  height: var(--rt-pg-height);
}
.rt-playground__pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--rt-pg-bg);
}
.rt-playground__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  color: var(--rt-pg-muted);
  font-size: 12px;
  border-bottom: 1px solid var(--rt-pg-border);
}
.rt-playground__status { font-variant-numeric: tabular-nums; }
.rt-playground__status.is-error { color: #f85149; }
.rt-playground__editor { flex: 1; overflow: auto; min-height: 0; }
.rt-playground__editor :deep(.cm-editor) { height: 100%; }
.rt-playground__editor :deep(.cm-scroller) { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.rt-playground__output {
  flex: 1;
  margin: 0;
  padding: 12px;
  overflow: auto;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
}
.rt-playground__output.is-error { color: #f85149; white-space: pre-wrap; }
@media (max-width: 720px) {
  .rt-playground__panes { grid-template-columns: 1fr; height: auto; }
  .rt-playground__editor { height: var(--rt-pg-height); }
  .rt-playground__output { height: var(--rt-pg-height); }
}
</style>
