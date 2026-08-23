<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { measureNodeSize, type Size } from '@/composables/nodeMeasure'
import { sizeModesFor } from '@/composables/styleSchema'
import { canvasTransform } from '@/composables/useCanvasView'
import {
  PIN_KEY,
  aspectRatioOf,
  canLockAspect,
  counterpartSize,
  setAspectLock,
  stretchesAxis,
  updateGeometry,
  updateSizeMode,
  usesSizeValue,
  type CanvasNode,
  type SizeAxis,
  type SizeMode,
} from '@/composables/useCanvasNodes'

/**
 * Width and Height, each collapsed to one row — a mode and a value
 * together, where they used to be two separate rows apiece — with the
 * aspect-ratio lock as a small connector between the two rather than a
 * row of its own below both.
 *
 * Owns the width/height writes directly, including the locked-ratio
 * counterpart calculation `StyleInspector.vue`'s generic field used to do
 * on its behalf: a widget wide enough to need two coordinated rows is a
 * widget that writes its own geometry, the same posture `ConstraintPins`
 * and `CornerRadius` already have.
 */
const props = defineProps<{ node: CanvasNode; id: string }>()

const AXES = ['width', 'height'] as const satisfies readonly SizeAxis[]

function modeOf(axis: SizeAxis): SizeMode {
  return axis === 'width' ? props.node.widthMode : props.node.heightMode
}

/** Whether the axis's number is something typed here rather than derived — `fill`/`fit`/a stretch read none. */
function statesSize(axis: SizeAxis) {
  return usesSizeValue(modeOf(axis)) && !stretchesAxis(props.node, axis)
}

/**
 * A live measurement, for whichever axis doesn't state its own size.
 *
 * Not Vue-reactive on its own — it reads the DOM directly — so the watch
 * below exists purely to give it a reason to re-run, the same pattern
 * `ConstraintPins.vue` already uses for its own live edges.
 */
const measured = ref<Size | null>(null)

function remeasure() {
  measured.value = measureNodeSize(props.node.id)
}

watch(() => [props.node, canvasTransform.value] as const, remeasure, {
  deep: true,
  flush: 'post',
  immediate: true,
})

/**
 * The value shown for `axis` — the stated number if there is one, or the
 * real current size otherwise, so the field never goes blank just
 * because a stretch or `fill`/`fit` is what's actually deciding it.
 */
function valueOf(axis: SizeAxis): string {
  if (statesSize(axis)) {
    const value = props.node[axis]
    return value === undefined ? '' : String(value)
  }
  const live = measured.value?.[axis]
  return live === undefined ? '' : String(Math.round(live))
}

function unitOf(axis: SizeAxis): string {
  return modeOf(axis) === 'relative' ? '%' : 'px'
}

const ratio = computed(() => aspectRatioOf(props.node))

function handleMode(axis: SizeAxis, event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  updateSizeMode(props.node.id, axis, target.value as SizeMode)
}

const FAR_EDGE: Record<SizeAxis, 'right' | 'bottom'> = { width: 'right', height: 'bottom' }

/**
 * States a derived axis at whatever it currently measures, before
 * anything else touches it — a stretch gives up its far pin (the near
 * edge stays the anchor, same as dragging a handle already does to a
 * stretched box), and `fill`/`fit` simply switch to fixed. Captures the
 * live value first and writes it right back, so the field never flashes
 * a stale or blank number the instant it becomes editable. A no-op once
 * the axis already states its own size.
 */
function stateSize(axis: SizeAxis) {
  if (statesSize(axis)) return

  const current = Number(valueOf(axis))

  if (stretchesAxis(props.node, axis)) {
    const edge = FAR_EDGE[axis]
    updateGeometry(props.node.id, { [edge]: undefined, [PIN_KEY[edge]]: false })
  }
  updateSizeMode(props.node.id, axis, 'fixed')
  if (Number.isFinite(current)) updateGeometry(props.node.id, { [axis]: current })
}

/** Focusing a derived field states it before any typing even happens. */
function handleFocus(axis: SizeAxis) {
  stateSize(axis)
}

function handleValue(axis: SizeAxis, event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return

  stateSize(axis)

  const value = target.value
  const numeric = value === '' ? undefined : Number(value)
  if (numeric !== undefined && !Number.isFinite(numeric)) return

  const counterpartAxis: SizeAxis = axis === 'width' ? 'height' : 'width'
  const counterpart =
    numeric !== undefined && ratio.value !== null
      ? { [counterpartAxis]: counterpartSize(ratio.value, axis, numeric) }
      : {}

  updateGeometry(props.node.id, { [axis]: numeric, ...counterpart })
}

function toggleLock() {
  setAspectLock(props.node.id, ratio.value === null)
}

/**
 * Two decimals: enough to tell 16:9 from 3:2, short enough for a tooltip.
 * Shown against 1 rather than reduced to whole numbers, which would need
 * a GCD and would still print 1920:1080 for a common case.
 */
const lockTitle = computed(() =>
  ratio.value === null
    ? 'Lock the width to height ratio'
    : `Unlock the ratio (${ratio.value.toFixed(2)} : 1)`,
)
</script>

<template>
  <div :id="id" class="size">
    <button
      v-if="canLockAspect(node)"
      type="button"
      id="field-aspectRatio"
      class="size__lock"
      :class="{ 'size__lock--on': ratio !== null }"
      :aria-pressed="ratio !== null"
      :title="lockTitle"
      @click="toggleLock"
    >
      <!-- One glyph, two states: unlocked pulls the two link segments
           apart along their own diagonal; locked lets them meet in the
           middle. A thin outline reads closer to Framer's icon set than
           a filled glyph would. -->
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <rect
          class="size__lock-link"
          :class="{ 'size__lock-link--open': ratio === null }"
          x="1"
          y="6.5"
          width="6"
          height="3"
          rx="1.5"
          transform="rotate(-45 4 8)"
        />
        <rect
          class="size__lock-link size__lock-link--far"
          :class="{ 'size__lock-link--open': ratio === null }"
          x="9"
          y="6.5"
          width="6"
          height="3"
          rx="1.5"
          transform="rotate(-45 12 8)"
        />
      </svg>
    </button>

    <div v-for="axis in AXES" :key="axis" class="size__row">
      <label class="size__label" :for="`field-${axis}Mode`">
        {{ axis === 'width' ? 'Width' : 'Height' }}
      </label>

      <div class="size__controls">
        <!-- Always present and always editable: a derived axis (a
             stretch, `fill`, `fit`) still has a real current size, and
             focusing or typing into it states that size explicitly —
             the same "click to make it explicit" interaction the
             constraints widget's own muted edges use. -->
        <input
          :id="`field-${axis}`"
          type="text"
          class="size__value"
          :class="{ 'size__value--muted': !statesSize(axis) }"
          :placeholder="unitOf(axis)"
          :value="valueOf(axis)"
          @focus="handleFocus(axis)"
          @input="handleValue(axis, $event)"
        />

        <select
          :id="`field-${axis}Mode`"
          class="size__mode"
          :value="modeOf(axis)"
          @change="handleMode(axis, $event)"
        >
          <option v-for="mode in sizeModesFor(node)" :key="mode" :value="mode">
            {{ mode }}
          </option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.size {
  display: grid;
  grid-template-columns: 1.25rem 1fr;
  column-gap: 0.5rem;
  row-gap: 0.5rem;
}

/* Spans both rows on the left, the same way the reference layout ties
   Width and Height together rather than listing the lock as a third
   row underneath both. */
.size__lock {
  grid-row: 1 / 3;
  align-self: center;
  justify-self: center;
  padding: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-fg-muted);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 0.25rem;
  cursor: pointer;
}

.size__lock:hover {
  color: var(--color-fg-default);
}

/* Carries the same accent as a pinned edge — both say "this is now
   constrained". */
.size__lock--on {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.size__lock-link {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
  transition: translate 0.1s ease-out;
}

/* Pulls each half apart along its own diagonal, so an unlocked ratio
   reads as a broken link rather than a smaller closed one. */
.size__lock-link--open {
  translate: -1.5px 1.5px;
}

.size__lock-link--far.size__lock-link--open {
  translate: 1.5px -1.5px;
}

/* Explicit, not auto-placed: with no shape to lock, the lock button is
   absent entirely, and a row auto-placed from the grid's start would
   land in the narrow column meant for it instead of sitting beside it. */
.size__row {
  grid-column: 2;
  display: grid;
  gap: 0.1875rem;
}

.size__label {
  font-size: 0.75rem;
  color: var(--color-fg-muted);
}

.size__controls {
  display: flex;
  gap: 0.25rem;
}

.size__value,
.size__mode {
  min-width: 0;
  padding: 0.25rem 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-fg-default);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 0.25rem;
}

.size__value {
  flex: 1;
}

/* A derived size — a stretch, `fill`, `fit` — reads as a live readout
   until it's focused, the same muted-until-touched treatment an
   unpinned edge gets in the constraints widget. */
.size__value--muted {
  color: var(--color-fg-subtle);
}

.size__mode {
  flex: 1.2;
}
</style>
