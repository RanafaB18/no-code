<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { measureNodeRect, measureNodeSize, type Rect, type Size } from '@/composables/nodeMeasure'
import { canvasTransform } from '@/composables/useCanvasView'
import {
  PIN_KEY,
  getNode,
  stretchesAxis,
  updateGeometry,
  updateSizeMode,
  type CanvasNode,
  type Edge,
  type SizeAxis,
} from '@/composables/useCanvasNodes'

/**
 * Which edges of the parent an element is anchored to, and how far along
 * each. Every edge always shows a number: the real pin if it has one, or
 * a live measured distance if it doesn't, so nothing is ever blank.
 * Clicking the toggle, or the number itself, pins an edge at whatever
 * value is currently shown.
 *
 * Pinned is its own concept, separate from whether the edge's field
 * holds a number — see `pinLeft`/`pinRight`/`pinTop`/`pinBottom` on
 * `NodeGeometry`. An axis with neither edge pinned is genuinely
 * proportional (its near edge tracks the parent as a percentage), not
 * just an unflagged fixed position — which is what makes "unpin
 * everything" a real, jump-free action rather than a gap the last-pin
 * rule used to have to prevent.
 */
const props = defineProps<{ node: CanvasNode }>()

const EDGES = ['top', 'right', 'bottom', 'left'] as const satisfies readonly Edge[]

/** The other edge on the same axis. */
const OPPOSITE: Record<Edge, Edge> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

const AXIS_OF: Record<Edge, SizeAxis> = {
  left: 'width',
  right: 'width',
  top: 'height',
  bottom: 'height',
}

/** The edge each axis's proportional percentage lives on. */
const START_OF: Record<SizeAxis, 'left' | 'top'> = { width: 'left', height: 'top' }
const END_OF: Record<SizeAxis, 'right' | 'bottom'> = { width: 'right', height: 'bottom' }

function isPinned(edge: Edge) {
  return props.node[PIN_KEY[edge]] === true
}

/**
 * A live measurement for whichever edges aren't pinned.
 *
 * Neither `measureNodeRect` nor the parent's own size are Vue-reactive —
 * they read the DOM directly — so nothing here would ever re-run on its
 * own. The watcher below exists purely to give this a reason to: the same
 * problem, and the same fix, as the selection overlay's own re-measure in
 * BuilderWorkspace.vue.
 */
const measured = ref<Rect | null>(null)
const parentSize = ref<Size | null>(null)

function remeasure() {
  measured.value = measureNodeRect(props.node.id)
  parentSize.value = measureNodeSize(props.node.parentId)
}

// Re-measures when this node's own geometry changes, when its parent's
// does (the parent resizing changes every unpinned distance to its far
// edges), or when the view pans or zooms. `deep: true` on the node
// objects is what catches a single field changing inside them; `flush:
// 'post'` matters the same way it does for the selection overlay — a
// 'pre' watcher would run before the DOM reflects whatever just changed.
watch(() => [props.node, getNode(props.node.parentId), canvasTransform.value] as const, remeasure, {
  deep: true,
  flush: 'post',
  immediate: true,
})

/**
 * The distance for `edge`, always in px, regardless of pin state or of
 * which unit is actually stored — a proportional axis's near edge holds
 * a percentage internally, but this always answers with the real current
 * pixel distance a live measurement would give, which is what the widget
 * shows either way.
 */
function valueFor(edge: Edge): number | null {
  if (isPinned(edge)) return props.node[edge] ?? null

  const rect = measured.value
  const size = parentSize.value
  if (!rect || !size) return null

  switch (edge) {
    case 'left':
      return rect.left
    case 'top':
      return rect.top
    case 'right':
      return size.width - rect.left - rect.width
    case 'bottom':
      return size.height - rect.top - rect.height
  }
}

/** Pins `edge` at whatever value is currently shown for it. */
function pin(edge: Edge) {
  const value = valueFor(edge)
  updateGeometry(props.node.id, { [edge]: value ?? 0, [PIN_KEY[edge]]: true })
}

/**
 * States a derived size before the axis stops deriving it — leaving a
 * stretch (both edges pinned → one) hands sizing back to `widthMode`,
 * and a stale stored number there would jump the moment it takes over.
 */
function freezeSize(axis: SizeAxis) {
  const rect = measured.value
  if (!rect) return
  updateSizeMode(props.node.id, axis, 'fixed')
  updateGeometry(props.node.id, { [axis]: rect[axis] })
}

/**
 * Converts an axis's current fixed position into the equivalent
 * percentage of the parent before dropping its last pin, so becoming
 * proportional doesn't itself cause a jump — the box renders at the same
 * spot either way, just now tracking the parent instead of holding still
 * as it resizes.
 */
function freezeProportional(axis: SizeAxis) {
  const rect = measured.value
  const size = parentSize.value
  if (!rect || !size) return

  const start = START_OF[axis]
  const end = END_OF[axis]
  const offset = axis === 'width' ? rect.left : rect.top
  const parentLength = size[axis]
  const percent = parentLength > 0 ? (offset / parentLength) * 100 : 0

  updateGeometry(props.node.id, {
    [start]: percent,
    [end]: undefined,
    [PIN_KEY[start]]: false,
    [PIN_KEY[end]]: false,
  })
}

function unpin(edge: Edge) {
  const axis = AXIS_OF[edge]
  if (isPinned(OPPOSITE[edge])) {
    // One pin remains on the axis afterwards — still a fixed position,
    // just from the other edge now.
    freezeSize(axis)
    updateGeometry(props.node.id, { [PIN_KEY[edge]]: false })
  } else {
    // This was the axis's last pin — becomes proportional.
    freezeProportional(axis)
  }
}

function toggle(edge: Edge) {
  if (isPinned(edge)) unpin(edge)
  else pin(edge)
}

const allPinned = computed(() => EDGES.every(isPinned))

/**
 * The centre box: pins every edge, or clears every edge outright — not
 * stopped by "one pin per axis", since every axis reaching proportional
 * at once is exactly the point of this action, not a gap to guard
 * against.
 */
function toggleAll() {
  if (!allPinned.value) {
    for (const edge of EDGES) if (!isPinned(edge)) pin(edge)
    return
  }
  freezeProportional('width')
  freezeProportional('height')
}

/** Focusing an unpinned field pins it before any typing even happens. */
function handleFocus(edge: Edge) {
  if (!isPinned(edge)) pin(edge)
}

/**
 * `@change`, not `@input` — unlike every other numeric field in the
 * inspector, this one commits only once the user unfocuses it, rather
 * than writing (and re-measuring, and re-deriving what stretches) on
 * every keystroke.
 *
 * The field is always pinned by the time this fires (`handleFocus` pins
 * on focus, before any typing), so the edge's own stored number is
 * always in px here — never the proportional percentage.
 */
function handleChange(edge: Edge, event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return

  const numeric = Number(target.value)
  if (!Number.isFinite(numeric)) return
  updateGeometry(props.node.id, { [edge]: numeric })
}

/** Axes whose size is derived rather than stated, for the caption. */
const stretching = computed(() =>
  (['width', 'height'] as const).filter((axis) => stretchesAxis(props.node, axis)),
)
</script>

<template>
  <div class="pins">
    <div class="pins__grid">
      <!-- Each pill is both the display and the control: a muted,
           unpinned distance becomes the real pin the moment it is
           clicked into or typed in, so there is nothing to press
           separately to "start" editing it. -->
      <label
        v-for="edge in EDGES"
        :key="edge"
        class="pins__pill"
        :class="[`pins__pill--${edge}`, { 'pins__pill--on': isPinned(edge) }]"
      >
        <input
          :id="`field-${edge}`"
          type="text"
          inputmode="numeric"
          class="pins__pill-input"
          :value="valueFor(edge) !== null ? Math.round(valueFor(edge)!) : ''"
          @focus="handleFocus(edge)"
          @change="handleChange(edge, $event)"
        />
        <span class="pins__pill-letter" aria-hidden="true">{{ edge[0]?.toUpperCase() }}</span>
        <!-- Swaps in on hover, in the letter's place — a text caret reads
             as "click to edit" in a way a static letter doesn't. -->
        <span class="pins__pill-caret" aria-hidden="true" />
      </label>

      <!-- The un-pin control, separate from the pills: this toggles
           whether the edge is pinned, while the pill next to it stays the
           place its number is read and edited either way. -->
      <div class="pins__center" role="group" aria-label="Constraints">
        <!-- Sits beneath the four edge buttons in paint order, so a click
             right at the border still hits the edge it's nearest to; only
             the open middle reaches this one. -->
        <button
          type="button"
          class="pins__toggle-all"
          :aria-pressed="allPinned"
          :aria-label="allPinned ? 'Unpin all edges' : 'Pin all edges'"
          :title="allPinned ? 'Unpin all edges' : 'Pin all edges'"
          @click="toggleAll"
        />
        <button
          v-for="edge in EDGES"
          :key="edge"
          type="button"
          class="pins__edge"
          :class="[`pins__edge--${edge}`, { 'pins__edge--on': isPinned(edge) }]"
          :data-pin="edge"
          :aria-pressed="isPinned(edge)"
          :aria-label="`Pin ${edge}`"
          :title="`Pin ${edge}`"
          @click="toggle(edge)"
        >
          <span class="pins__edge-mark" aria-hidden="true" />
        </button>
      </div>
    </div>

    <p v-if="stretching.length" class="pins__note">
      {{ stretching.join(' and ') }} stretches with the parent
    </p>
  </div>
</template>

<style scoped>
.pins {
  display: grid;
  gap: 0.5rem;
  justify-items: center;
}

/* Named areas, so each pill's position is stated once as `grid-area`
   rather than as a pile of row/column numbers that have to be read
   together to picture the widget. */
.pins__grid {
  display: grid;
  grid-template-areas:
    '.    top    .'
    'left center right'
    '.    bottom .';
  grid-template-columns: auto 2.5rem auto;
  grid-template-rows: auto 2.5rem auto;
  gap: 0.5rem;
  place-items: center;
}

.pins__pill--top {
  grid-area: top;
}

.pins__pill--left {
  grid-area: left;
}

.pins__pill--right {
  grid-area: right;
}

.pins__pill--bottom {
  grid-area: bottom;
}

.pins__pill {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3125rem 0.625rem;
  background-color: var(--color-surface-sunken);
  border-radius: 999px;
  cursor: text;
}

/* The load-bearing accent — same idea as the edge mark below, now on the
   pill the value itself lives in. */
.pins__pill--on {
  background-color: color-mix(in srgb, var(--color-accent) 14%, var(--color-surface-sunken));
}

.pins__pill-input {
  width: 4ch;
  padding: 0;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-fg-subtle);
  text-align: right;
  background: none;
  border: none;
}

.pins__pill--on .pins__pill-input {
  color: var(--color-fg-default);
  font-weight: 600;
}

.pins__pill-letter {
  font-size: 0.625rem;
  color: var(--color-fg-subtle);
}

.pins__pill--on .pins__pill-letter {
  color: var(--color-accent);
}

.pins__center {
  grid-area: center;
  position: relative;
  width: 100%;
  height: 100%;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

/* Inset from the box's own edges so it never competes with the four edge
   buttons' hit zones — only a click in the open middle reaches this one. */
.pins__toggle-all {
  position: absolute;
  inset: 4px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0.3125rem;
  cursor: pointer;
}

.pins__toggle-all:hover {
  background-color: var(--color-surface-sunken);
}

/* One per side of the centre box, sitting just outside its border — the
   un-pin control. Sized for a comfortable click target, but the visible
   mark inside stays a short line, so the widget reads the way the
   reference does: a small tick, not a bar. */
.pins__edge {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
}

.pins__edge--top,
.pins__edge--bottom {
  left: 50%;
  width: 14px;
  height: 14px;
  translate: -50% 0;
}

.pins__edge--left,
.pins__edge--right {
  top: 50%;
  width: 14px;
  height: 14px;
  translate: 0 -50%;
}

.pins__edge--top {
  top: -7px;
}

.pins__edge--bottom {
  bottom: -7px;
}

.pins__edge--left {
  left: -7px;
}

.pins__edge--right {
  right: -7px;
}

.pins__edge-mark {
  background-color: var(--color-border-strong);
  border-radius: 1px;
}

.pins__edge--top .pins__edge-mark,
.pins__edge--bottom .pins__edge-mark {
  width: 2px;
  height: 11px;
}

.pins__edge--left .pins__edge-mark,
.pins__edge--right .pins__edge-mark {
  width: 11px;
  height: 2px;
}

.pins__edge:hover .pins__edge-mark {
  background-color: var(--color-fg-muted);
}

.pins__edge--on .pins__edge-mark {
  background-color: var(--color-accent);
}

.pins__note {
  font-size: 0.6875rem;
  color: var(--color-fg-subtle);
  text-align: center;
}
</style>
