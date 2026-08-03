<script setup lang="ts">
import { computed } from 'vue'

import {
  AXIS_EDGES,
  updateGeometry,
  type CanvasNode,
  type NodeGeometry,
} from '@/composables/useCanvasNodes'

/**
 * Which edges of the parent an element is anchored to.
 *
 * The model has always supported this — geometry is optional edge pins,
 * not x/y/w/h — but nothing exposed it. Pinning one edge holds the
 * element that far from it; pinning both **derives the size**, so the
 * element stretches as the parent resizes. That last case is what makes
 * an absolute layout responsive at all, and it is unreachable from the
 * numeric fields alone.
 */
const props = defineProps<{ node: CanvasNode }>()

type Edge = 'top' | 'right' | 'bottom' | 'left'

const EDGES = ['top', 'right', 'bottom', 'left'] as const satisfies readonly Edge[]

const OPPOSITE: Record<Edge, Edge> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

function isPinned(edge: Edge) {
  return props.node[edge] !== undefined
}

/**
 * True when this is the last pin holding its axis.
 *
 * An axis with no pins at all has nothing positioning it, so an absolute
 * element would fall back to where it would have sat in flow — a jump
 * with no obvious cause. The last pin is therefore not removable; to move
 * the element off that edge you pin the opposite one and drop this one.
 */
function isOnlyPin(edge: Edge) {
  return isPinned(edge) && !isPinned(OPPOSITE[edge])
}

function toggle(edge: Edge) {
  if (isOnlyPin(edge)) return

  // Pinned edges clear; unpinned ones start flush against that side. Zero
  // rather than a measured distance because measuring belongs to the
  // workspace, and in the case this widget exists for — pinning the
  // second edge of an axis — the element stretches to meet it anyway.
  const patch: NodeGeometry = { [edge]: isPinned(edge) ? undefined : 0 }
  updateGeometry(props.node.id, patch)
}

/** Axes whose size is derived rather than stated, for the caption. */
const stretching = computed(() =>
  (Object.keys(AXIS_EDGES) as (keyof typeof AXIS_EDGES)[]).filter((axis) => {
    const [start, end] = AXIS_EDGES[axis]
    return props.node[start] !== undefined && props.node[end] !== undefined
  }),
)
</script>

<template>
  <div class="pins">
    <div class="pins__grid" role="group" aria-label="Constraints">
      <button
        v-for="edge in EDGES"
        :key="edge"
        type="button"
        class="pins__edge"
        :class="[`pins__edge--${edge}`, { 'pins__edge--on': isPinned(edge) }]"
        :style="{ gridArea: edge }"
        :data-pin="edge"
        :aria-pressed="isPinned(edge)"
        :aria-label="`Pin ${edge}`"
        :disabled="isOnlyPin(edge)"
        :title="isOnlyPin(edge) ? `${edge} is the only pin on its axis` : `Pin ${edge}`"
        @click="toggle(edge)"
      />
      <span class="pins__box" aria-hidden="true" />
    </div>

    <p v-if="stretching.length" class="pins__note">
      {{ stretching.join(' and ') }} stretches with the parent
    </p>
  </div>
</template>

<style scoped>
.pins {
  display: grid;
  gap: 0.375rem;
  justify-items: center;
}

/* Named areas, so each button's position is stated once as `grid-area`
   rather than as a pile of row/column numbers that have to be read
   together to picture the widget. */
.pins__grid {
  display: grid;
  grid-template-areas:
    '.    top    .'
    'left box    right'
    '.    bottom .';
  grid-template-columns: 0.75rem 1.75rem 0.75rem;
  grid-template-rows: 0.75rem 1.75rem 0.75rem;
  gap: 0.1875rem;
  place-items: center;
  padding: 0.25rem;
}

.pins__box {
  grid-area: box;
  width: 100%;
  height: 100%;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.125rem;
}

.pins__edge {
  width: 100%;
  height: 100%;
  padding: 0;
  background-color: var(--color-border-strong);
  border: none;
  border-radius: 1px;
  cursor: pointer;
}

/* The bars read as edges only if they run along the side they pin. */
.pins__edge--top,
.pins__edge--bottom {
  width: 1.25rem;
  height: 2px;
}

.pins__edge--left,
.pins__edge--right {
  width: 2px;
  height: 1.25rem;
}

.pins__edge:hover:not(:disabled) {
  background-color: var(--color-fg-muted);
}

.pins__edge--on {
  background-color: var(--color-accent);
}

/* Not greyed out: it is the active, load-bearing pin, and fading it would
   say the opposite of what it means. The cursor carries the message. */
.pins__edge--on:disabled {
  cursor: default;
}

.pins__note {
  font-size: 0.6875rem;
  color: var(--color-fg-subtle);
  text-align: center;
}
</style>
