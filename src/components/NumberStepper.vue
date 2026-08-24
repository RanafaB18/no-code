<script setup lang="ts">
/**
 * A whole number with a button either side of it.
 *
 * For counts rather than measurements: how many columns, how many cells
 * to span. Stepping is the natural gesture for those — you add a column,
 * you rarely type "4" — but the field stays typable, because jumping from
 * 2 to 12 by clicking ten times is not.
 *
 * `min` is enforced in both directions rather than only on the buttons: a
 * typed 0 or a typed `-3` would otherwise get through and write a track
 * count no grid can have.
 */
const props = withDefaults(
  defineProps<{
    value: number
    /** The field's id, so the caller's own `<label for>` reaches it. */
    id: string
    /** What one of these counts, for the buttons' labels — "column", "row". */
    unit: string
    min?: number
  }>(),
  { min: 1 },
)

const emit = defineEmits<{ update: [value: number] }>()

function clamp(value: number) {
  return Math.max(props.min, Math.round(value))
}

function step(by: number) {
  emit('update', clamp(props.value + by))
}

function onInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return

  const next = Number(target.value)
  // An empty or half-typed field ("-", "1e") is not a number yet. Left
  // alone rather than snapped to the minimum, which would fight anyone
  // clearing the field to type a new value.
  if (target.value === '' || !Number.isFinite(next)) return

  emit('update', clamp(next))
}
</script>

<template>
  <div class="stepper">
    <input
      :id="id"
      type="text"
      inputmode="numeric"
      class="stepper__input"
      :value="value"
      @input="onInput"
    />

    <!-- Labelled, not left to the glyphs: "−" alone announces as "minus",
         which says nothing about what it takes away. -->
    <button
      type="button"
      class="stepper__button"
      :disabled="value <= min"
      :aria-label="`Remove a ${unit}`"
      @click="step(-1)"
    >
      −
    </button>
    <button
      type="button"
      class="stepper__button"
      :aria-label="`Add a ${unit}`"
      @click="step(1)"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.stepper {
  display: flex;
  align-items: stretch;
  gap: 0.25rem;
  min-width: 0;
}

.stepper__input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.375rem;
  font-family: inherit;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-fg-default);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 0.25rem;
}

.stepper__button {
  width: 1.5rem;
  font-size: 0.8125rem;
  line-height: 1;
  color: var(--color-fg-muted);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 0.25rem;
  cursor: pointer;
}

.stepper__button:hover:not(:disabled) {
  color: var(--color-fg-default);
  background-color: var(--color-surface-sunken);
}

.stepper__button:disabled {
  color: var(--color-fg-subtle);
  opacity: 0.5;
  cursor: default;
}
</style>
