<script setup>
import { ref, onMounted, computed } from 'vue';
import { VueWriter } from 'vue-writer';

const props = defineProps({
  leading: {
    type: String,
    default: '',
  },
  // A word in `leading` to strike through (e.g. "fixed"), with `enhancedWord`
  // written as a handwritten correction over it. No HTML in the markdown.
  strikeWord: {
    type: String,
    default: '',
  },
  enhancedWord: {
    type: String,
    default: '',
  },
  suffix: {
    type: String,
    default: '',
  },
  titles: {
    type: Array,
    required: true,
  },
  level: {
    type: Number,
    default: 1,
    validator: (value) => value >= 1 && value <= 6,
  },
});

// Split `leading` around `strikeWord` so the struck word + its handwritten
// correction render as real elements (no v-html, no markup in the frontmatter).
const leadingParts = computed(() => {
  const text = props.leading;
  const word = props.strikeWord;
  if (!word || !text.includes(word)) return { before: text, after: '' };
  const index = text.indexOf(word);
  return { before: text.slice(0, index), after: text.slice(index + word.length) };
});

// Initial text shown during SSR (first item)
const initialText = computed(() => props.titles[0] || '');

// Reorder array for VueWriter: start from second item, put first item at the end
const vueWriterTitles = computed(() => [...props.titles.slice(1), props.titles[0]]);

// Track if we're mounted (client-side)
const isMounted = ref(false);

onMounted(() => {
  isMounted.value = true;
});
</script>

<template>
  <div class="typed-title-container">
    <component :is="`h${level}`" class="typed-title-heading">
      <span v-if="leading" class="typed-title-leading">{{ leadingParts.before }}<span v-if="strikeWord" class="title-strike"><span class="title-strike-word">{{ strikeWord }}</span><span class="title-strike-line" aria-hidden="true" /><span v-if="enhancedWord" class="title-enhanced">{{ enhancedWord }}</span></span>{{ leadingParts.after }}</span>
      <span class="typed-title">
        <!-- Show VueWriter only after mounting (client-side) -->
        <template v-if="isMounted">
          <VueWriter :array="vueWriterTitles" :delay="4000" :erase-speed="20" :type-speed="50" caret="underscore" />
        </template>
        <!-- Show static text during SSR -->
        <span v-else class="is-typed">
          <span class="typed">{{ initialText }}</span>
          <span class="underscore" />
        </span>
      </span>
      <span v-if="suffix" class="typed-title-suffix">{{ suffix }}</span>
    </component>
    <p v-if="$slots.description" class="typed-title-description">
      <slot name="description" />
    </p>
  </div>
</template>

<style scoped>
.typed-title-container {
  display: block;
  width: 100%;
  text-align: center;
}

/* Match u-page-hero title styling: text-5xl sm:text-7xl text-pretty tracking-tight font-bold text-highlighted */
.typed-title-heading {
  display: block;
  width: 100%;
  font-size: 3rem; /* text-5xl */
  line-height: 1.3;
  font-weight: 700; /* font-bold */
  text-wrap: pretty;
  color: var(--ui-text-highlighted, var(--color-gray-900));
}

@media (min-width: 640px) {
  .typed-title-heading {
    font-size: 4.5rem; /* sm:text-7xl */
  }
}

.typed-title-leading {
  --gradient-color: var(--ui-saturated);
  display: block;
  /* Gradient text effect - continuous left to right movement */
  background: linear-gradient(
    90deg,
    var(--gradient-color, #22c55e) 0%,
    color-mix(in srgb, var(--gradient-color, #22c55e) 55%, #60a5fa) 25%,
    var(--gradient-color, #22c55e) 50%,
    color-mix(in srgb, var(--gradient-color, #22c55e) 55%, #60a5fa) 75%,
    var(--gradient-color, #22c55e) 100%
  );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 200% 100%;
  animation: gradient-flow 6s linear infinite;
}

/* "We fixed → enhanced" hero correction: "fixed" is struck through and
   "enhanced" is written over it as a smaller, tilted handwritten label
   (absolutely positioned relative to the struck word). */
.title-strike {
  position: relative;
  display: inline-block;
}

/* the struck word, a touch smaller than the rest of the title */
.title-strike-word {
  color: var(--ui-text-dimmed);
  -webkit-text-fill-color: var(--ui-text-dimmed);
}

/* a real strike line (not text-decoration) so it can tilt, round its ends and
   bow into a gentle curve for a hand-drawn feel */
.title-strike-line {
  position: absolute;
  left: -7%;
  right: -7%;
  top: 54%;
  height: 4px;
  border-radius: 4px;
  transform: rotate(-4.5deg);
  pointer-events: none;
  background-color: #daa520;
}

.title-enhanced {
  transform: translateX(-55%) rotate(-3.5deg);
  position: absolute;
  left: 50%;
  bottom: 1.6em;
  font-family: 'Comic Sans MS', 'Brush Script MT', 'Caveat', cursive;
  font-size: 0.62em;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  color: #daa520;
  -webkit-text-fill-color: #daa520;
  text-decoration: none;
  pointer-events: none;
}

@keyframes gradient-flow {
  0% {
    background-position: 0% center;
  }
  100% {
    background-position: -200% center;
  }
}

.typed-title {
  display: block;
  min-height: 1.2em;
  min-width: 1rem;
  font-size: 0.7em;
}

.typed-title-suffix {
  display: block;
}

/* Match u-page-hero description styling: text-lg sm:text-xl/8 text-muted mt-6 text-balance */
.typed-title-description {
  margin-top: 1.5rem; /* mt-6 */
  font-size: 1.5rem; /* text-lg */
  line-height: 1.75rem;
  text-wrap: balance;
}

@media (min-width: 640px) {
  .typed-title-description {
    font-size: 1.25rem; /* sm:text-xl */
    line-height: 2rem; /* /8 */
  }
}

:deep(.is-typed) {
  display: inline;
}

/* Style for both SSR fallback and VueWriter caret — a vertical typing bar.
   (Swapped the underscore's width/height so it stands upright, rather than a
   rotate() which would leave a wide, mis-aligned layout box.) */
:deep(.is-typed span.underscore),
.typed-title :deep(.is-typed span.underscore) {
  display: inline-block;
  width: 0.08em;
  height: 1em;
  background-color: var(--ui-primary, #4ade80);
  color: var(--ui-primary0, #4ade80);
  animation: blink 1.5s infinite;
  margin-left: 0.12em;
  vertical-align: text-bottom;
}

:deep(.is-typed span.cursor.typing) {
  animation: none;
}

@keyframes blink {
  0%, 49% {
    opacity: 1;
  }
  50%, 99% {
    opacity: 0;
  }
}

@media screen and (max-width: 600px) {
  .typed-title-heading {
    font-size: 2.5rem;
  }
  .typed-title-leading {
    padding-bottom: 0.5rem;
  }
  .typed-title {
    font-size: 1.5rem;
    
  }
  .is-typed span.underscore {
    display: none;
  }
}
</style>
