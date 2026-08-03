<script setup lang="ts">
import { computed } from 'vue'

import { aspectRatioOf, setAspectLock, type CanvasNode } from '@/composables/useCanvasNodes'

/**
 * Ties Width and Height together at the shape the element has right now.
 *
 * A toggle rather than a ratio the user types: the shape being kept is
 * almost always one already on the canvas, and reading it off the element
 * means the lock never changes what you are looking at at the moment you
 * engage it.
 *
 * Once engaged, editing either size — in the fields above or by dragging a
 * handle — carries the other with it.
 */
const props = defineProps<{ node: CanvasNode; id: string }>()

const ratio = computed(() => aspectRatioOf(props.node))

/**
 * Two decimals: enough to tell 16:9 from 3:2, short enough to sit inside
 * the button. Shown against 1 rather than reduced to whole numbers, which
 * would need a GCD and would still print 1920:1080 for a common case.
 */
const label = computed(() => (ratio.value === null ? 'Unlocked' : `${ratio.value.toFixed(2)} : 1`))

function toggle() {
  setAspectLock(props.node.id, ratio.value === null)
}
</script>

<template>
  <button
    :id="id"
    type="button"
    class="ratio"
    :class="{ 'ratio--on': ratio !== null }"
    :aria-pressed="ratio !== null"
    :title="ratio === null ? 'Lock the width to height ratio' : 'Unlock the ratio'"
    @click="toggle"
  >
    <span class="ratio__glyph" aria-hidden="true">{{ ratio === null ? '⛓' : '🔒' }}</span>
    {{ label }}
  </button>
</template>

<style scoped>
.ratio {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0.25rem 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-fg-muted);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 0.25rem;
  cursor: pointer;
}

.ratio:hover {
  color: var(--color-fg-default);
}

/* The engaged state carries the same accent as a pinned edge — both say
   "this is now constrained", and they sit two sections apart. */
.ratio--on {
  color: var(--color-fg-default);
  border-color: var(--color-accent);
}

.ratio__glyph {
  font-size: 0.75rem;
  line-height: 1;
}
</style>
