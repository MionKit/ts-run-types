<script setup lang="ts">
// RuntypesPlayground - embeds the runtypes-playground web component in the docs
// site. The package ships a self-contained browser bundle (the Monaco-based
// <runtypes-playground> custom element + the ts-runtypes resolver compiled to
// WebAssembly); container/website/scripts/build-playground.sh builds it and
// stages it under /playground-app/. This component loads that bundle client-side
// and renders the element, keeping the page in full control of the layout around it.
//
// Browser-only: the bundle touches window / WebAssembly / customElements, so it
// loads in onMounted (never during SSR) and shows a placeholder until ready.

const props = withDefaults(
  defineProps<{
    // Initial TypeScript snippet (must define `MyType`). Omitted -> the element's
    // own seed type.
    type?: string;
    // Initial build function: validate | errors | jsonEncoder | jsonDecoder |
    // binaryEncoder | binaryDecoder | graph.
    operation?: string;
    // Initial JSON input for the chosen function.
    input?: string;
    // Min height reserved for the embedded playground (any CSS length).
    height?: string;
  }>(),
  { height: '520px' },
);

// The bundle is staged under /playground-app/ (not /playground/, which is this
// page's own content route) by container/website/scripts/build-playground.sh.
const PLAYGROUND_BASE = '/playground-app';
const TAG = 'runtypes-playground';

const host = ref<HTMLElement | null>(null);
const status = ref<'loading' | 'ready' | 'error'>('loading');
const errorMessage = ref('');

// loadBundleOnce injects the content-hashed entry chunk exactly once per page,
// resolving its filename from the build manifest so a fresh deploy never serves a
// stale stable name pointing at a removed hashed chunk.
let bundlePromise: Promise<void> | null = null;
function loadBundleOnce(): Promise<void> {
  if (bundlePromise) return bundlePromise;
  bundlePromise = (async () => {
    if (customElements.get(TAG)) return;
    const res = await fetch(`${PLAYGROUND_BASE}/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(
        `Playground bundle not staged (${res.status}). It auto-builds on \`scripts/website.sh dev\` (needs the Go toolchain + bootstrapped submodule); or build it directly with container/website/scripts/build-playground.sh.`,
      );
    }
    const manifest = (await res.json()) as Record<string, { file: string; isEntry?: boolean }>;
    const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
    if (!entry) throw new Error('playground manifest has no entry chunk');
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = `${PLAYGROUND_BASE}/${entry.file}`;
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () => reject(new Error('failed to load the playground bundle')));
      document.head.appendChild(script);
    });
    // The bundle registers the custom element as an import side effect.
    await customElements.whenDefined(TAG);
  })();
  bundlePromise.catch(() => {
    bundlePromise = null;
  });
  return bundlePromise;
}

onMounted(async () => {
  try {
    await loadBundleOnce();
    const el = document.createElement(TAG);
    if (props.type) el.setAttribute('type', props.type);
    if (props.operation) el.setAttribute('operation', props.operation);
    if (props.input) el.setAttribute('input', props.input);
    host.value?.replaceChildren(el);
    status.value = 'ready';
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
    status.value = 'error';
  }
});
</script>

<template>
  <div class="rt-playground-embed" :style="{ '--rt-pg-min-height': height }">
    <p v-if="status === 'loading'" class="rt-playground-embed__status">
      Loading the playground. The resolver runs as WebAssembly (a few megabytes), so the first load takes a moment.
    </p>
    <p v-else-if="status === 'error'" class="rt-playground-embed__status rt-playground-embed__status--error">
      {{ errorMessage }}
    </p>
    <div
      ref="host"
      class="rt-playground-embed__host"
      :class="{ 'rt-playground-embed__host--ready': status === 'ready' }"
    />
  </div>
</template>

<style scoped>
.rt-playground-embed {
  margin: 1.5rem 0;
}
/* Reserve the playground height only once the element is mounted; while loading,
   the centered status message owns the reserved area (so it does not double up). */
.rt-playground-embed__host--ready {
  min-height: var(--rt-pg-min-height);
}
.rt-playground-embed__status {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--rt-pg-min-height);
  margin: 0;
  padding: 10px 16px;
  color: var(--ui-text-muted, #8b949e);
  font-size: 13px;
  text-align: center;
}
.rt-playground-embed__status--error {
  color: #f85149;
  white-space: pre-wrap;
  text-align: left;
}
</style>
