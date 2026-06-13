<script setup lang="ts">
// Big, colorful stat tiles for the homepage "Tested to the same standard" card.
// Each tile is one section (front-end / Go); the number is gradient-filled text,
// hue passed per tile so the two read as distinct colors.
interface Tile {
  value: string
  label: string
  sub?: string
  hue?: number
}

const props = withDefaults(defineProps<{tiles?: Tile[]}>(), {tiles: () => []})

const gradient = (hue = 145) =>
  `linear-gradient(120deg, hsl(${hue} 70% 52%), hsl(${hue + 38} 66% 56%))`
</script>

<template>
  <div class="stat-tiles">
    <div v-for="tile in tiles" :key="tile.label" class="stat-tile">
      <span class="stat-tile-value" :style="{backgroundImage: gradient(tile.hue)}">{{ tile.value }}</span>
      <span class="stat-tile-label">{{ tile.label }}</span>
      <span v-if="tile.sub" class="stat-tile-sub">{{ tile.sub }}</span>
    </div>
  </div>
</template>

<style scoped>
.stat-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin: 0.85rem 0;
}

.stat-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0.85rem 1rem;
  border: 1px solid var(--ui-border);
  border-radius: 0.6rem;
  background: color-mix(in srgb, var(--ui-text-muted) 6%, transparent);
}

.stat-tile-value {
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.stat-tile-label {
  margin-top: 0.4rem;
  font-size: 0.82rem;
  color: var(--ui-text-muted);
}

.stat-tile-sub {
  margin-top: 0.1rem;
  font-size: 0.7rem;
  color: var(--ui-text-dimmed);
}

@media (max-width: 420px) {
  .stat-tiles {
    grid-template-columns: 1fr;
  }
}
</style>
