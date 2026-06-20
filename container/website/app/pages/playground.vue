<script setup lang="ts">
// Standalone, full-bleed playground page - intentionally OUTSIDE the docs reading
// flow (no left nav, no right TOC) and a sibling of the home page. It is a real
// Nuxt route using the minimal `fullscreen` layout. (Docus's content catch-all
// does not honor a per-page `layout` frontmatter - the docs sidebars are rendered
// by that catch-all, not a swappable layout - so the playground lives as its own
// page rather than a content/*.md entry. The site's global header + footer still
// wrap it.)
//
// The content is centered in a UContainer, matching the home page's content width
// (max-w-(--ui-container), mx-auto, responsive padding).
definePageMeta({ layout: 'fullscreen' });
useSeoMeta({
  title: 'Playground',
  description: 'Write a TypeScript type and run its generated functions live in your browser.',
});
</script>

<template>
  <UContainer class="rt-playground-page">
    <RuntypesPlayground />
  </UContainer>
</template>

<style scoped>
.rt-playground-page {
  padding-top: 16px;
  padding-bottom: 16px;
}
</style>

<!-- Global (not scoped): the playground renders a light-DOM web component, which a
     scoped :deep cannot reach. Gated by .rt-playground-page so it only affects this
     page. Sizes the playground to fill the viewport between the global header/footer. -->
<style>
.rt-playground-page .rt-playground-embed {
  margin: 0;
}
.rt-playground-page .rt-playground-embed__host {
  min-height: 0;
}
.rt-playground-page .rt-playground .rtpg-layout {
  height: calc(75vh - 120px);
}
</style>
