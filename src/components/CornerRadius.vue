<script setup lang="ts">
import { computed } from 'vue'

import { RADIUS_CORNERS, UNIFORM_RADIUS_KEY, isStyleSet } from '@/composables/styleSchema'
import { updateStyle, type CanvasNode } from '@/composables/useCanvasNodes'

/**
 * Border radius as one value or as four.
 *
 * Two forms of the same property, so only ever one of them is written:
 * `borderRadius` is a shorthand and the four corners are its longhands,
 * and with both in the style map which one wins would come down to
 * insertion order — a rule nothing about the UI would explain.
 */
const props = defineProps<{ node: CanvasNode; id: string }>()

/**
 * Derived from the styles rather than stored as UI state, so the mode
 * shown always matches what is actually in effect — including for an
 * element selected long after the corners were set.
 */
const perCorner = computed(() =>
  RADIUS_CORNERS.some((corner) => isStyleSet(props.node, corner.key)),
)

function read(key: string) {
  return props.node.styles[key] ?? ''
}

function write(key: string, value: string) {
  updateStyle(props.node.id, key, value)
}

function handleInput(key: string, event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) write(key, target.value)
}

function split() {
  // Seeded from the uniform value so the four fields open showing what the
  // one field was already rendering — and seeded with something even when
  // it was empty, because `perCorner` reads the corners themselves and
  // four blanks would flip straight back to uniform.
  const seed = read(UNIFORM_RADIUS_KEY) || '0'
  for (const corner of RADIUS_CORNERS) write(corner.key, seed)
  write(UNIFORM_RADIUS_KEY, '')
}

function merge() {
  // Top left wins where the corners differ. Four values cannot survive
  // becoming one, and picking the first-read corner is at least a rule the
  // user can predict — the alternative is refusing to switch back.
  const first = read(RADIUS_CORNERS[0].key)
  for (const corner of RADIUS_CORNERS) write(corner.key, '')
  write(UNIFORM_RADIUS_KEY, first)
}
</script>

<template>
  <div class="radius">
    <div v-if="perCorner" :id="id" class="radius__corners" role="group" aria-label="Radius">
      <label v-for="corner in RADIUS_CORNERS" :key="corner.key" class="radius__corner">
        <span class="radius__corner-label">{{ corner.label }}</span>
        <input
          :id="`field-${corner.key}`"
          type="text"
          class="radius__input"
          placeholder="0"
          :value="read(corner.key)"
          @input="handleInput(corner.key, $event)"
        />
      </label>
    </div>

    <input
      v-else
      :id="id"
      type="text"
      class="radius__input"
      placeholder="0"
      :value="read(UNIFORM_RADIUS_KEY)"
      @input="handleInput(UNIFORM_RADIUS_KEY, $event)"
    />

    <button type="button" class="radius__mode" @click="perCorner ? merge() : split()">
      {{ perCorner ? 'Use one value' : 'Set each corner' }}
    </button>
  </div>
</template>

<style scoped>
.radius {
  display: grid;
  gap: 0.25rem;
}

/* Two by two, so each field sits at the corner it controls — the labels
   say which, but the arrangement is what makes it readable at a glance. */
.radius__corners {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
}

.radius__corner {
  display: grid;
  gap: 0.125rem;
}

.radius__corner-label {
  font-size: 0.6875rem;
  color: var(--color-fg-subtle);
}

.radius__input {
  min-width: 0;
  padding: 0.25rem 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-fg-default);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 0.25rem;
}

.radius__mode {
  justify-self: start;
  padding: 0;
  font-size: 0.6875rem;
  color: var(--color-fg-muted);
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
}

.radius__mode:hover {
  color: var(--color-fg-default);
}
</style>
