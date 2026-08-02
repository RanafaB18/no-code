<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useEventListener } from '@vueuse/core'

import NodeRenderer from '@/components/NodeRenderer.vue'
import { onResizeFrame } from '@/composables/useViewport'
import { useToolShortcuts } from '@/composables/useToolShortcuts'
import { useTools, type Tool } from '@/composables/useTools'
import { useCanvasNodes } from '@/composables/useCanvasNodes'

const { activeTool, disarm } = useTools()
const { rootIds, selectedId, selectedNode, addNode, selectNode } = useCanvasNodes()

const workspace = useTemplateRef<HTMLElement>('workspace')

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * An element's box in pixels relative to `.workspace`.
 *
 * Both rects are viewport-relative, so subtracting them cancels page
 * scroll — and unlike offsetLeft/offsetTop the result holds regardless of
 * which ancestor happens to be the offsetParent. That assumption was only
 * ever true because elements were `position: static` with `.workspace` as
 * the nearest positioned ancestor; nesting and an editable `display`
 * (one day `position`) both undermine it.
 *
 * `clientLeft`/`clientTop` subtract the workspace's own border, since an
 * absolutely positioned overlay is placed from the padding box.
 *
 * Looked up by attribute rather than a ref-callback map: an inline `:ref`
 * arrow is a new function each render, so Vue would tear the entry down
 * and rebuild it on every re-render. This costs one query, only when
 * something actually needs measuring.
 */
function measureRect(id: string | null): Rect | null {
  const root = workspace.value
  const node = id ? root?.querySelector<HTMLElement>(`[data-node-id="${id}"]`) : null
  if (!root || !node) return null

  const box = node.getBoundingClientRect()
  const origin = root.getBoundingClientRect()
  return {
    left: box.left - origin.left - root.clientLeft,
    top: box.top - origin.top - root.clientTop,
    width: box.width,
    height: box.height,
  }
}

/** Turns a measured rect into overlay positioning, grown by `gap` a side. */
function frameStyle(rect: Rect | null, gap: number) {
  if (!rect) return null
  return {
    left: `${rect.left - gap}px`,
    top: `${rect.top - gap}px`,
    width: `${rect.width + gap * 2}px`,
    height: `${rect.height + gap * 2}px`,
  }
}

/**
 * The selection frame's box.
 *
 * Deliberately NOT rendered as children of the selected element: that
 * element is a real DOM node the user is authoring, so decorative handles
 * can't live inside it without appearing in the user's own content. The
 * frame is a sibling overlay, positioned to match.
 */
const selectionRect = ref<Rect | null>(null)

function measureSelection() {
  selectionRect.value = measureRect(selectedId.value)
}

/**
 * Gap, in px, between the element's true edge and the drawn frame.
 *
 * `selectionRect` stays an honest measurement of the element itself —
 * future resize handles would need the real bounds, not an inflated
 * one — so the gap is applied only where the frame is rendered.
 */
const SELECTION_GAP = 4

const selectionFrameStyle = computed(() => frameStyle(selectionRect.value, SELECTION_GAP))

/**
 * The frame a new element will be nested into, resolved once when the
 * drag begins.
 *
 * Resolved at pointerdown rather than tracked live because
 * `setPointerCapture` retargets every later pointer event to the capture
 * element — `event.target` on pointermove would always be the workspace
 * root, so live `closest()` tracking cannot work. Pressing to choose the
 * parent also matches the existing rule that a drag's position is
 * ignored and only its size is used.
 *
 * The node is kept alongside the id because the ghost teleports into it.
 */
const dropTargetId = ref<string | null>(null)
const dropTargetNode = ref<HTMLElement | null>(null)
const dropRect = ref<Rect | null>(null)

/** Drawn flush, so it reads as an inner fill inside any selection frame. */
const dropFrameStyle = computed(() => frameStyle(dropRect.value, 0))

/** The innermost element under the pointer, or null for bare workspace. */
function resolveDropTarget(event: PointerEvent): HTMLElement | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  // `closest` walks ancestor-or-self, so the innermost frame wins for free.
  return target.closest<HTMLElement>('[data-node-id]')
}

// Re-measure whenever the selection changes, or the selected element's
// own styles change (padding/border/width edits from the inspector move
// or resize it).
//
// flush: 'post' rather than a nested nextTick(): a default 'pre' watcher
// runs *before* the component re-renders, so a newly selected element
// wouldn't be in the DOM yet. 'post' runs after that render, so the node
// is queryable by the time this fires.
watch([selectedId, () => selectedNode.value?.styles], measureSelection, {
  deep: true,
  flush: 'post',
})

// A window resize can reflow the whole page even without any element's
// own styles changing. Throttled — this reads four layout properties, and
// resize fires continuously while a window edge is dragged.
useEventListener(window, 'resize', onResizeFrame(measureSelection))

/**
 * The eight resize grips, as positions along the frame.
 *
 * Coordinates travel as CSS custom properties so a single rule places
 * them all, rather than one rule per named position.
 */
const SELECTION_HANDLES = [
  { name: 'top-left', x: '0%', y: '0%', corner: true },
  { name: 'top', x: '50%', y: '0%', corner: false },
  { name: 'top-right', x: '100%', y: '0%', corner: true },
  { name: 'right', x: '100%', y: '50%', corner: false },
  { name: 'bottom-right', x: '100%', y: '100%', corner: true },
  { name: 'bottom', x: '50%', y: '100%', corner: false },
  { name: 'bottom-left', x: '0%', y: '100%', corner: true },
  { name: 'left', x: '0%', y: '50%', corner: false },
] as const

/**
 * Below this, a drag is treated as a stray click rather than an intent
 * to draw — without it, an ordinary click (a 0x0 drag) would litter the
 * workspace with invisible elements.
 */
const MIN_DRAG = 4

const dragOrigin = ref<{ x: number; y: number } | null>(null)
const dragCurrent = ref<{ x: number; y: number } | null>(null)

/**
 * Size of the drag so far, in px.
 *
 * Only the distance travelled matters, never where the drag happened:
 * elements live in normal flow, so the workspace decides *where* a new
 * element goes and the drag decides only *how big* it is. `Math.abs`
 * is what lets the drag run in any of the four directions.
 */
const dragSize = computed(() => {
  if (!dragOrigin.value || !dragCurrent.value) return null
  return {
    width: Math.abs(dragCurrent.value.x - dragOrigin.value.x),
    height: Math.abs(dragCurrent.value.y - dragOrigin.value.y),
  }
})

/**
 * Width becomes an explicit width, but height becomes `min-height` so
 * content and padding can still grow the box later. It also stops a new
 * element collapsing to zero height and looking like nothing happened.
 */
function sizeToStyles(size: { width: number; height: number }) {
  return { width: `${size.width}px`, minHeight: `${size.height}px` }
}

/**
 * The tool's seed styles plus the drag's size.
 *
 * Size second, so the gesture — the more specific intent — wins if a
 * tool ever seeds a width of its own.
 *
 * `inline` is the exception. Width and height do not apply to
 * non-replaced inline boxes, so emitting them would put CSS in the
 * inspector that the browser silently ignores: a value you can read but
 * never observe. Better to emit nothing than to lie. The element is
 * still created and selected; adding padding gives it a box.
 */
function creationStyles(tool: Tool, size: { width: number; height: number }) {
  const seed = tool.seedStyles()
  if (seed.display === 'inline') return seed
  return { ...seed, ...sizeToStyles(size) }
}

const ghostStyle = computed(() => (dragSize.value ? sizeToStyles(dragSize.value) : null))

function clearDrag() {
  dragOrigin.value = null
  dragCurrent.value = null
  dropTargetId.value = null
  dropTargetNode.value = null
  dropRect.value = null
}

function handlePointerDown(event: PointerEvent) {
  if (!activeTool.value) {
    // Idle mode: selection is delegated here rather than bound per
    // element, so the innermost element under the pointer wins — a
    // per-element handler would fire for the child *and* every ancestor
    // it bubbles through. Pressing bare workspace resolves to null and
    // clears.
    //
    // Deliberately pointerdown rather than click. A click is synthesised
    // after every drag, and it fires *after* the tool has disarmed, so a
    // click-based selector would immediately re-select the frame just
    // drawn into and discard the new element's selection. jsdom never
    // synthesises that click, so no test would have caught it.
    selectNode(resolveDropTarget(event)?.dataset.nodeId ?? null)
    return
  }

  // Stops the browser starting a native text selection as the pointer
  // moves with the button held, which would fight the drag visually.
  event.preventDefault()

  dragOrigin.value = { x: event.clientX, y: event.clientY }
  dragCurrent.value = { x: event.clientX, y: event.clientY }

  const target = resolveDropTarget(event)
  dropTargetNode.value = target
  dropTargetId.value = target?.dataset.nodeId ?? null
  dropRect.value = measureRect(dropTargetId.value)

  // Captured on the workspace root, not `event.target`: the target may be
  // a child element that re-renders mid-drag, and the root is the stable
  // owner of the gesture. Keeps the drag alive if the pointer leaves the
  // window. jsdom doesn't implement pointer capture, hence the guard.
  if (event.currentTarget instanceof Element) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Unsupported here; the drag still works, it just won't follow the
      // pointer outside the element.
    }
  }
}

function handlePointerMove(event: PointerEvent) {
  if (!dragOrigin.value) return
  dragCurrent.value = { x: event.clientX, y: event.clientY }
}

function handlePointerUp(event: PointerEvent) {
  const tool = activeTool.value
  const size = dragSize.value

  if (tool && size && size.width >= MIN_DRAG && size.height >= MIN_DRAG) {
    const created = addNode(tool.creates, creationStyles(tool, size), dropTargetId.value)
    // Hand the new element to the inspector — the tool disarms below, so
    // we land in select mode with the thing just drawn already selected.
    selectNode(created.id)
    // One draw per arming: the tool releases itself rather than staying
    // armed for another.
    disarm()
  }

  if (event.currentTarget instanceof Element) {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // See handlePointerDown.
    }
  }

  clearDrag()
}

useToolShortcuts(() => {
  disarm()
  clearDrag()
})
</script>

<template>
  <div
    ref="workspace"
    class="workspace"
    :class="{ 'workspace--armed': activeTool !== null }"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="clearDrag"
    @dragstart.prevent
    @selectstart.prevent
  >
    <!-- No @click here: selection is delegated to the root handler so the
         innermost element wins, and so this stays a single-prop component
         that can skip re-rendering. -->
    <NodeRenderer v-for="id in rootIds" :key="id" :node-id="id" />

    <!--
      The ghost renders as the target's last child — exactly where the
      real element will be appended — so the preview is laid out by that
      frame's own flex/grid rules and lands where it appears to.

      Teleport rather than passing the target down the tree: the ghost
      stays part of this component's render and is merely *placed*
      elsewhere in the DOM, so the target element's render function is
      never invoked. Prop-drilling a ghost target would re-render every
      element on every frame of every drag.

      The element is passed, not a selector string — a selector resolves
      via document.querySelector and would need the workspace attached to
      the document.

      This is a deliberate, narrow exception to the rule that keeps the
      selection frame out of authored content: the ghost has to
      participate in layout to preview it at all, it is transient, and it
      lives outside the `elements` tree, so an export walking that tree
      can never see it. Do not "fix" it into a sibling.
    -->
    <Teleport v-if="dropTargetNode" :to="dropTargetNode">
      <div v-if="ghostStyle" class="workspace__ghost" :style="ghostStyle" />
    </Teleport>
    <div v-else-if="ghostStyle" class="workspace__ghost" :style="ghostStyle" />

    <!--
      The frame about to receive the element. Drawn flush and only when
      nesting — a root-level drop shows nothing, since the ghost sitting
      at the page end already says so.
    -->
    <div v-if="dropFrameStyle" class="workspace__drop-target" :style="dropFrameStyle" />

    <!--
      Selection frame: a sibling overlay, not a child of the selected
      element — see the comment on selectionRect for why. pointer-events
      stays off throughout; the handles are not wired to anything yet
      (no resize this iteration), so they must not look draggable.
    -->
    <div v-if="selectionFrameStyle" class="workspace__selection" :style="selectionFrameStyle">
      <span
        v-for="handle in SELECTION_HANDLES"
        :key="handle.name"
        class="workspace__handle"
        :class="handle.corner ? 'workspace__handle--corner' : 'workspace__handle--edge'"
        :style="{ '--handle-x': handle.x, '--handle-y': handle.y }"
      />
    </div>
  </div>
</template>

<style scoped>
.workspace {
  position: relative;
  min-height: 100vh;
}

.workspace--armed {
  cursor: crosshair;
  /* Belt and braces with preventDefault() in handlePointerDown: kills
     the native highlight for the whole time a tool is armed, including
     the instant before drag state exists. */
  user-select: none;
}

/* Elements deliberately keep their pointer events while armed. Events
   bubble to the root where every handler lives and selection is guarded
   by `activeTool`, so a drag starting on an element still draws — and
   `event.target` stays informative, which is what makes resolving the
   drop target possible at all. */

.workspace__ghost {
  outline: 1px dashed var(--color-accent);
  outline-offset: -1px;
  background-color: color-mix(in srgb, var(--color-accent) 12%, transparent);
  pointer-events: none;
}

/*
 * Selection frame — a border plus corner/edge handles, positioned over
 * the selected element rather than drawn inside it (see the comment on
 * selectionRect in the script). Non-interactive for now: nothing here
 * responds to pointer events, since there is no resize behaviour yet to
 * back the handles up.
 */
.workspace__selection {
  position: absolute;
  border: 1px solid var(--color-accent);
  pointer-events: none;
}

/* Flush and filled, versus the selection frame's offset border — so an
   element that is both selected and the drop target reads as an inner
   highlight inside an outer frame rather than two fighting outlines.
   The tint stays low because it paints over the frame's children too. */
.workspace__drop-target {
  position: absolute;
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
  background-color: color-mix(in srgb, var(--color-accent) 6%, transparent);
  pointer-events: none;
}

/* One rule places all eight: each handle carries its own coordinates as
   custom properties, and the translate centres it on that point. */
.workspace__handle {
  position: absolute;
  left: var(--handle-x);
  top: var(--handle-y);
  translate: -50% -50%;
  background-color: var(--color-surface-raised);
  border: 1px solid var(--color-accent);
}

.workspace__handle--corner {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.workspace__handle--edge {
  width: 5px;
  height: 5px;
}
</style>
