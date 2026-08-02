<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useEventListener } from '@vueuse/core'

import WorkspaceElement from '@/components/WorkspaceElement.vue'
import { onResizeFrame } from '@/composables/useViewport'
import { useToolShortcuts } from '@/composables/useToolShortcuts'
import { useTools } from '@/composables/useTools'
import { useWorkspaceElements } from '@/composables/useWorkspaceElements'

const { activeTool, disarm } = useTools()
const { elements, selectedId, selectedElement, addElement, select } = useWorkspaceElements()

const workspace = useTemplateRef<HTMLElement>('workspace')

/**
 * The selection frame's box, in pixels relative to `.workspace`.
 *
 * Read via offsetLeft/offsetTop/offsetWidth/offsetHeight rather than
 * `getBoundingClientRect`: with `.workspace` as the positioned ancestor
 * (`position: relative`), those offsets already are workspace-relative
 * coordinates, with no viewport/scroll conversion to get wrong.
 *
 * This deliberately does NOT render as children of the selected element.
 * That element is a real DOM node the user is authoring — the div that
 * was drawn — so decorative handles can't live inside it without
 * appearing in the user's own content. The frame is a sibling overlay
 * instead, positioned to match.
 */
const selectionRect = ref<{ left: number; top: number; width: number; height: number } | null>(
  null,
)

function measureSelection() {
  const id = selectedId.value
  // Looked up by attribute rather than tracked in a ref-callback map: an
  // inline `:ref` arrow is a new function each render, so Vue tears the
  // entry down and rebuilds it on every re-render. This costs one query,
  // and only when the selection actually needs re-measuring.
  const node = id ? workspace.value?.querySelector<HTMLElement>(`[data-element-id="${id}"]`) : null

  selectionRect.value = node
    ? {
        left: node.offsetLeft,
        top: node.offsetTop,
        width: node.offsetWidth,
        height: node.offsetHeight,
      }
    : null
}

/**
 * Gap, in px, between the element's true edge and the drawn frame.
 *
 * `selectionRect` stays an honest measurement of the element itself —
 * future resize handles would need the real bounds, not an inflated
 * one — so the gap is applied only where the frame is actually rendered,
 * expanding it outward on every side rather than flush against the box.
 */
const SELECTION_GAP = 4

const selectionFrameStyle = computed(() => {
  const rect = selectionRect.value
  if (!rect) return null
  return {
    left: `${rect.left - SELECTION_GAP}px`,
    top: `${rect.top - SELECTION_GAP}px`,
    width: `${rect.width + SELECTION_GAP * 2}px`,
    height: `${rect.height + SELECTION_GAP * 2}px`,
  }
})

// Re-measure whenever the selection changes, or the selected element's
// own styles change (padding/border/width edits from the inspector move
// or resize it).
//
// flush: 'post' rather than a nested nextTick(): a default 'pre' watcher
// runs *before* the component re-renders, so a newly selected element
// wouldn't be in the DOM yet. 'post' runs after that render, so the node
// is queryable by the time this fires.
watch([selectedId, () => selectedElement.value?.styles], measureSelection, {
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

const ghostStyle = computed(() => (dragSize.value ? sizeToStyles(dragSize.value) : null))

function clearDrag() {
  dragOrigin.value = null
  dragCurrent.value = null
}

function handlePointerDown(event: PointerEvent) {
  if (!activeTool.value) {
    // Idle mode: pressing on bare workspace clears the selection.
    // Deliberately on pointerdown rather than click — a click is
    // synthesised after every drag, so doing this on click would wipe
    // the selection of the element the drag had just created.
    if (event.target === event.currentTarget) select(null)
    return
  }

  // Stops the browser starting a native text selection as the pointer
  // moves with the button held, which would fight the drag visually.
  event.preventDefault()

  dragOrigin.value = { x: event.clientX, y: event.clientY }
  dragCurrent.value = { x: event.clientX, y: event.clientY }

  // Keeps the drag alive if the pointer leaves the workspace mid-gesture.
  // jsdom doesn't implement pointer capture, hence the guard.
  if (event.target instanceof Element) {
    try {
      event.target.setPointerCapture(event.pointerId)
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
    const created = addElement(tool.id, sizeToStyles(size))
    // Hand the new element to the inspector — the tool disarms below, so
    // we land in select mode with the thing just drawn already selected.
    select(created.id)
    // One draw per arming: the tool releases itself rather than staying
    // armed for another.
    disarm()
  }

  if (event.target instanceof Element) {
    try {
      event.target.releasePointerCapture(event.pointerId)
    } catch {
      // See handlePointerDown.
    }
  }

  clearDrag()
}

/** Selection only applies in idle mode; while armed, clicks draw. */
function handleElementClick(id: string) {
  if (activeTool.value) return
  select(id)
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
    <WorkspaceElement
      v-for="element in elements"
      :key="element.id"
      :element="element"
      @click="handleElementClick(element.id)"
    />

    <!--
      The ghost renders last, which is exactly where the real element
      will be appended — so the preview shows the true landing spot
      rather than promising a position the flow won't honour.
    -->
    <div v-if="ghostStyle" class="workspace__ghost" :style="ghostStyle" />

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

/* While armed, pointer events pass straight through to the workspace so
   a drag that starts on top of an existing element still draws instead
   of selecting it. Targets the child component's root by class. */
.workspace--armed :deep(.workspace-element) {
  pointer-events: none;
}

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
