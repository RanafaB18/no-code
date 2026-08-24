<script setup lang="ts">
import NumberStepper from '@/components/NumberStepper.vue'
import { updateStyle, type CanvasNode } from '@/composables/useCanvasNodes'

/**
 * How many cells of its parent's grid this frame covers.
 *
 * Sits in the Size section rather than Layout, and that is the right
 * place for it: spanning two columns is a statement about how big this
 * frame is, not about how it arranges anything inside itself. It is the
 * grid's answer to Width and Height, which is why it sits above them.
 *
 * Not to be confused with the parent's own Columns and Rows — those set
 * how many cells exist, this sets how many of them one child takes.
 */
const props = defineProps<{ node: CanvasNode; id: string }>()

const AXES = [
  { axis: 'columns', label: 'Columns', unit: 'column', key: 'gridColumn' },
  { axis: 'rows', label: 'Rows', unit: 'row', key: 'gridRow' },
] as const

const SPAN = /^span\s+(\d+)$/

/** No value is a span of one — a frame occupies a cell by default. */
function spanOf(key: string) {
  const match = props.node.styles[key]?.match(SPAN)
  return match ? Number(match[1]) : 1
}

function setSpan(key: string, span: number) {
  // Cleared rather than written as `span 1`: one cell is what a frame
  // does without being told, and '' is how the inspector spells unset,
  // so this keeps the styles map free of entries that change nothing.
  updateStyle(props.node.id, key, span <= 1 ? '' : `span ${span}`)
}
</script>

<template>
  <div :id="id" class="span">
    <div v-for="track in AXES" :key="track.axis" class="span__row">
      <label class="span__label" :for="`field-${track.key}`">{{ track.label }}</label>

      <NumberStepper
        :id="`field-${track.key}`"
        :value="spanOf(track.key)"
        :unit="track.unit"
        @update="setSpan(track.key, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.span {
  display: grid;
  gap: 0.5rem;
}

.span__row {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  align-items: center;
  gap: 0.5rem;
}

.span__label {
  font-size: 0.75rem;
  color: var(--color-fg-muted);
}
</style>
