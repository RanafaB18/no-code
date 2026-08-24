<script setup lang="ts">
import NumberStepper from '@/components/NumberStepper.vue'
import { updateStyle, type CanvasNode } from '@/composables/useCanvasNodes'

/**
 * How many columns and rows a grid frame has.
 *
 * A count rather than a CSS template, because a count is the decision
 * actually being made — "three across" — and `repeat(3, 1fr)` is only how
 * that gets written down. Even tracks are the whole vocabulary here; a
 * grid wanting `2fr 1fr` needs a different control, and would be better
 * served by one than by a text box everyone has to learn CSS to use.
 *
 * Writes the two properties separately rather than the `grid-template`
 * shorthand, so each stepper touches only its own axis.
 */
const props = defineProps<{ node: CanvasNode; id: string }>()

const AXES = [
  { axis: 'columns', label: 'Columns', unit: 'column', key: 'gridTemplateColumns' },
  { axis: 'rows', label: 'Rows', unit: 'row', key: 'gridTemplateRows' },
] as const

/**
 * Only the shape this widget itself writes.
 *
 * Anything else — a template typed in by hand, or one carried in from
 * somewhere else — reads as 1 rather than being guessed at. This widget
 * is the only thing that writes these properties today, so that case is
 * contained; if a raw template ever becomes editable, the two need to
 * agree on what happens here.
 */
const EVEN_TRACKS = /^repeat\((\d+),\s*1fr\)$/

function countOf(key: string) {
  const match = props.node.styles[key]?.match(EVEN_TRACKS)
  return match ? Number(match[1]) : 1
}

function setCount(key: string, count: number) {
  updateStyle(props.node.id, key, `repeat(${count}, 1fr)`)
}
</script>

<template>
  <div :id="id" class="tracks">
    <div v-for="track in AXES" :key="track.axis" class="tracks__row">
      <label class="tracks__label" :for="`field-${track.key}`">{{ track.label }}</label>

      <NumberStepper
        :id="`field-${track.key}`"
        :value="countOf(track.key)"
        :unit="track.unit"
        @update="setCount(track.key, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.tracks {
  display: grid;
  gap: 0.5rem;
}

/* The label column is sized to match the inspector's other rows, so
   Columns and Rows line up with Gap and Justify beneath them. */
.tracks__row {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  align-items: center;
  gap: 0.5rem;
}

.tracks__label {
  font-size: 0.75rem;
  color: var(--color-fg-muted);
}
</style>
