<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useEventListener } from '@vueuse/core'

import NodeRenderer from '@/components/NodeRenderer.vue'
import { measureNodeRect, nodeElement, toLocal, type Rect } from '@/composables/nodeMeasure'
import { onResizeFrame } from '@/composables/useViewport'
import { useCanvasShortcuts } from '@/composables/useCanvasShortcuts'
import { useTools } from '@/composables/useTools'
import {
  VIEWPORT_ID,
  getNode,
  isViewport,
  resolvedPosition,
  stretchesAxis,
  useCanvasNodes,
  type CanvasNode,
  type NodeGeometry,
  type NodeId,
  type SizeAxis,
} from '@/composables/useCanvasNodes'

const { activeTool, disarm } = useTools()
const {
  selectedId,
  selectedNode,
  addNode,
  removeNode,
  selectNode,
  moveNode,
  updateGeometry,
  updateSizeMode,
} = useCanvasNodes()

/**
 * The layout the receiving frame imposes.
 *
 * Drawing branches on it: a frame with no layout places children by the
 * offsets they carry, so the drawn position is honoured. A flex or grid
 * frame places them itself, so the position is discarded and only the
 * size survives.
 */
const dropTargetLayout = computed(() => getNode(dropTargetId.value)?.layout ?? 'none')

const workspace = useTemplateRef<HTMLElement>('workspace')

/**
 * An element's box in pixels relative to `.workspace` — the space the
 * selection and drop-target overlays are positioned in.
 */
function measureRect(id: NodeId | null): Rect | null {
  const element = nodeElement(id)
  if (!element || !workspace.value) return null
  return toLocal(element.getBoundingClientRect(), workspace.value)
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
 * `selectionRect` stays an honest measurement of the element itself — the
 * resize handles work from pointer deltas against the node's own stored
 * box, not against the frame — so the gap is applied only where the frame
 * is rendered.
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

/**
 * The node to select, or null to clear.
 *
 * Split from the drop target because the two want different fallbacks now
 * that the viewport fills the surface: it is a legitimate *parent* to draw
 * into, but pressing it is pressing empty canvas, so it is deliberately
 * not pointer-selectable. It is reachable from its own control instead.
 */
function resolveSelectionTarget(event: PointerEvent): string | null {
  const id = resolveDropTarget(event)?.dataset.nodeId ?? null
  return isViewport(id) ? null : id
}

// Re-measure whenever the selection changes, or anything about the
// selected node does. Deliberately the whole node rather than its
// `styles` alone: geometry, layout and position are first-class fields
// now, and a drag that writes `left` would otherwise leave the frame
// sitting where the element used to be.
//
// flush: 'post' rather than a nested nextTick(): a default 'pre' watcher
// runs *before* the component re-renders, so a newly selected element
// wouldn't be in the DOM yet. 'post' runs after that render, so the node
// is queryable by the time this fires.
watch([selectedId, selectedNode], measureSelection, {
  deep: true,
  flush: 'post',
})

// A window resize can reflow the whole page even without any element's
// own styles changing. Throttled — this reads four layout properties, and
// resize fires continuously while a window edge is dragged.
useEventListener(window, 'resize', onResizeFrame(measureSelection))

/** The sides of a box a gesture can drag. */
type Edge = 'top' | 'right' | 'bottom' | 'left'

interface SelectionHandle {
  name: string
  /** Position along the frame, as CSS percentages. */
  x: string
  y: string
  corner: boolean
  cursor: string
  /** Which edges this grip moves — the whole of what resize needs to know. */
  edges: readonly Edge[]
}

/**
 * The eight resize grips.
 *
 * Coordinates travel as CSS custom properties so a single rule places
 * them all, rather than one rule per named position. The edges are listed
 * explicitly rather than parsed back out of `name`, so the resize maths
 * never depends on how a handle happens to be spelled.
 */
const SELECTION_HANDLES = [
  {
    name: 'top-left',
    x: '0%',
    y: '0%',
    corner: true,
    cursor: 'nwse-resize',
    edges: ['top', 'left'],
  },
  { name: 'top', x: '50%', y: '0%', corner: false, cursor: 'ns-resize', edges: ['top'] },
  {
    name: 'top-right',
    x: '100%',
    y: '0%',
    corner: true,
    cursor: 'nesw-resize',
    edges: ['top', 'right'],
  },
  { name: 'right', x: '100%', y: '50%', corner: false, cursor: 'ew-resize', edges: ['right'] },
  {
    name: 'bottom-right',
    x: '100%',
    y: '100%',
    corner: true,
    cursor: 'nwse-resize',
    edges: ['bottom', 'right'],
  },
  { name: 'bottom', x: '50%', y: '100%', corner: false, cursor: 'ns-resize', edges: ['bottom'] },
  {
    name: 'bottom-left',
    x: '0%',
    y: '100%',
    corner: true,
    cursor: 'nesw-resize',
    edges: ['bottom', 'left'],
  },
  { name: 'left', x: '0%', y: '50%', corner: false, cursor: 'ew-resize', edges: ['left'] },
] as const satisfies readonly SelectionHandle[]

/**
 * Below this, a drag is treated as a stray click rather than an intent
 * to draw — without it, an ordinary click (a 0x0 drag) would litter the
 * workspace with invisible elements.
 */
const MIN_DRAG = 4

const dragOrigin = ref<{ x: number; y: number } | null>(null)
const dragCurrent = ref<{ x: number; y: number } | null>(null)

/**
 * The drawn rectangle in **viewport** coordinates, normalised so a drag in
 * any of the four directions yields positive width and height.
 */
const dragRect = computed(() => {
  const origin = dragOrigin.value
  const current = dragCurrent.value
  if (!origin || !current) return null

  return {
    left: Math.min(origin.x, current.x),
    top: Math.min(origin.y, current.y),
    width: Math.abs(current.x - origin.x),
    height: Math.abs(current.y - origin.y),
  }
})

/**
 * The drawn rectangle expressed **relative to the frame receiving it**.
 *
 * Absolute offsets resolve against the containing block, which is the
 * target frame — so the viewport-space pointer coordinates have to be
 * rebased onto it, or every nested node would be positioned as though it
 * sat at the page origin.
 */
function geometryFor(target: HTMLElement | null) {
  const rect = dragRect.value
  if (!rect) return null

  const local = toLocal(rect, target)
  return {
    left: Math.round(local.left),
    top: Math.round(local.top),
    width: Math.round(local.width),
    height: Math.round(local.height),
  }
}

/**
 * The ghost previews the box being drawn, under the pointer.
 *
 * Always absolutely positioned at the drawn offset, even when the target
 * frame lays its children out — a rubber band that jumped to wherever the
 * flex row happened to end would stop tracking the gesture that is
 * drawing it. The frame takes the element over on release; until then the
 * pointer is in charge.
 *
 * Being out of flow is what makes that safe: the ghost is teleported into
 * the target, but an absolute box is not laid out by its parent, so
 * previewing it never shifts the siblings it is about to join. The target
 * is always `absolute` or `relative`, never `static`, so it is reliably
 * the containing block these offsets resolve against.
 */
const ghostStyle = computed(() => {
  const geometry = geometryFor(dropTargetNode.value)
  if (!geometry) return null

  return {
    width: `${geometry.width}px`,
    height: `${geometry.height}px`,
    position: 'absolute' as const,
    left: `${geometry.left}px`,
    top: `${geometry.top}px`,
  }
})

function clearDrag() {
  dragOrigin.value = null
  dragCurrent.value = null
  dropTargetId.value = null
  dropTargetNode.value = null
  dropRect.value = null
}

/**
 * A move or resize in progress.
 *
 * `edges` is what separates the two: empty means the whole box is being
 * dragged, otherwise those sides are.
 *
 * Deliberately a plain `let` rather than a ref — nothing in the template
 * reads it, and making it reactive would schedule a re-render on every
 * pointermove of every drag for no visible gain.
 */
interface Transform {
  nodeId: NodeId
  edges: readonly Edge[]
  /** Cached from `resolvedPosition` at the start: a gesture cannot change it. */
  absolute: boolean
  origin: { x: number; y: number }
  /** The node's box when the gesture began, measured where it carries no pin. */
  start: Rect
  /**
   * The pins exactly as they were, so Escape can put them back. An
   * `undefined` here means "was unset", which `updateGeometry` restores
   * by clearing rather than by writing a zero.
   */
  restore: NodeGeometry
  /**
   * Edges whose pin this gesture gave up at the start.
   *
   * Dragging an edge of a stretched axis — one pinned at both ends —
   * states a size where the parent had been deriving one. Something has
   * to give, and it is the edge under the pointer: the opposite one
   * anchors, so the box resizes from the side you are not holding.
   */
  released: readonly Edge[]
  /** Stays false until the pointer clears MIN_DRAG, so a click is not a drag. */
  moved: boolean
}

let transform: Transform | null = null

/**
 * Below this a resize would be smaller than it is selectable, and a
 * negative one would flip the box inside out.
 */
const MIN_SIZE = 1

/** The edge across the box from each, for deciding which one anchors. */
const OPPOSITE_EDGE: Record<Edge, Edge> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

/** Which edges govern which axis, for turning a resize into a size mode. */
const RESIZE_AXES = [
  ['width', ['left', 'right']],
  ['height', ['top', 'bottom']],
] as const satisfies readonly (readonly [SizeAxis, readonly Edge[]])[]

/**
 * Takes ownership of the gesture on the workspace root, not on whatever
 * was pressed: a handle unmounts the moment the selection re-measures,
 * and a node re-renders as it is dragged, either of which would drop the
 * capture mid-gesture. Keeps the drag alive if the pointer leaves the
 * window. jsdom doesn't implement pointer capture, hence the guard.
 */
function capturePointer(pointerId: number) {
  try {
    workspace.value?.setPointerCapture(pointerId)
  } catch {
    // Unsupported here; the drag still works, it just won't follow the
    // pointer outside the element.
  }
}

function releasePointer(pointerId: number) {
  try {
    workspace.value?.releasePointerCapture(pointerId)
  } catch {
    // See capturePointer.
  }
}

/**
 * The size a gesture starts from, in rendered pixels.
 *
 * The stored number is only that when the axis is `fixed` and states its
 * own size. A stretched axis derives its size from the parent, and a
 * `relative` one stores a percentage — in both cases the stored number is
 * not what is on screen, and dragging from it would jump the box to a
 * size the user never saw.
 */
function startSize(node: CanvasNode, measured: Rect | null, axis: SizeAxis) {
  const mode = axis === 'width' ? node.widthMode : node.heightMode
  const stated = mode === 'fixed' && !stretchesAxis(node, axis)
  return (stated ? node[axis] : undefined) ?? measured?.[axis] ?? 0
}

/**
 * Starts a move (no edges) or a resize (the handle's edges).
 *
 * The starting box falls back to a measurement per field, because a node
 * placed by a flex parent carries no `left`/`top` at all and one drawn
 * without a size carries no `width`/`height` — but both still have a real
 * rendered box to drag from.
 */
function beginTransform(event: PointerEvent, nodeId: NodeId, edges: readonly Edge[]) {
  const node = getNode(nodeId)
  // The viewport is the document, not a box within it: it has nothing to
  // position against and no parent to reorder it among.
  if (!node || isViewport(nodeId)) return

  const measured = measureNodeRect(nodeId)
  const released = edges.filter((edge) => node[OPPOSITE_EDGE[edge]] !== undefined)

  transform = {
    nodeId,
    edges,
    released,
    absolute: resolvedPosition(node) === 'absolute',
    origin: { x: event.clientX, y: event.clientY },
    start: {
      left: node.left ?? measured?.left ?? 0,
      top: node.top ?? measured?.top ?? 0,
      width: startSize(node, measured, 'width'),
      height: startSize(node, measured, 'height'),
    },
    // All four pins, not just the origin pair: a gesture can drop one, so
    // cancelling has to be able to put it back.
    restore: {
      left: node.left,
      right: node.right,
      top: node.top,
      bottom: node.bottom,
      width: node.width,
      height: node.height,
    },
    moved: false,
  }

  // Snapshotted above first, so Escape can restore what this drops.
  if (released.length > 0) {
    updateGeometry(
      nodeId,
      Object.fromEntries(released.map((edge) => [edge, undefined])) as NodeGeometry,
    )
  }

  capturePointer(event.pointerId)
}

/**
 * The geometry a resize drag produces.
 *
 * Dragging a top or left edge moves the origin as well as the size, and
 * by however much the size *actually* changed — so a width that hits
 * MIN_SIZE pins that edge in place instead of letting the box run on past
 * the pointer. The origin is only written when the node positions itself;
 * under a flex or grid parent those offsets would be inert.
 */
function resizeGeometry(active: Transform, dx: number, dy: number): NodeGeometry {
  const { left, top, width, height } = active.start
  const patch: NodeGeometry = {}

  // The origin only moves for an edge this gesture still holds. A
  // released one is now derived from the anchor opposite it, so writing
  // the pin back would stretch the box again on the very next frame.
  const holds = (edge: Edge) => active.absolute && !active.released.includes(edge)

  if (active.edges.includes('right')) patch.width = Math.max(MIN_SIZE, width + dx)
  if (active.edges.includes('left')) {
    const next = Math.max(MIN_SIZE, width - dx)
    patch.width = next
    if (holds('left')) patch.left = left + (width - next)
  }

  if (active.edges.includes('bottom')) patch.height = Math.max(MIN_SIZE, height + dy)
  if (active.edges.includes('top')) {
    const next = Math.max(MIN_SIZE, height - dy)
    patch.height = next
    if (holds('top')) patch.top = top + (height - next)
  }

  return patch
}

/**
 * Where a dragged node should land among its siblings.
 *
 * Reading order rather than a single axis, so one rule serves a row, a
 * column and a grid alike: a sibling comes before the drop when the
 * pointer is past its bottom edge entirely, or level with it and past its
 * midpoint.
 *
 * Sibling boxes are read here rather than cached at gesture start because
 * an in-flow move changes nothing until release — nothing has shifted
 * under us in between.
 */
function insertionIndex(node: CanvasNode, point: { x: number; y: number }): number {
  const parent = getNode(node.parentId)
  if (!parent) return 0

  let index = 0
  for (const siblingId of parent.childrenIds) {
    if (siblingId === node.id) continue

    const element = nodeElement(siblingId)
    if (!element) continue

    const box = element.getBoundingClientRect()
    const level = point.y >= box.top && point.y <= box.bottom
    if (point.y > box.bottom || (level && point.x > box.left + box.width / 2)) index += 1
  }

  return index
}

function applyTransform(event: PointerEvent) {
  const active = transform
  if (!active) return

  const dx = event.clientX - active.origin.x
  const dy = event.clientY - active.origin.y

  // Same threshold as drawing: without it, the press that selects an
  // element would nudge it by whatever jitter the pointer had.
  if (!active.moved && Math.abs(dx) < MIN_DRAG && Math.abs(dy) < MIN_DRAG) return
  active.moved = true

  if (active.edges.length > 0) {
    // Dragging an edge states a size in pixels, so an axis that was
    // filling or fitting becomes fixed — at whatever it was measuring
    // when the gesture began, which `start` already holds.
    for (const [axis, sides] of RESIZE_AXES) {
      if (sides.some((side) => active.edges.includes(side))) {
        updateSizeMode(active.nodeId, axis, 'fixed')
      }
    }
    updateGeometry(active.nodeId, resizeGeometry(active, dx, dy))
    return
  }

  // A move only writes offsets for a node that positions itself. An
  // in-flow node is placed by its parent, so dragging it means reordering
  // it among its siblings — which is settled on release, from where the
  // pointer finally landed.
  if (active.absolute) {
    updateGeometry(active.nodeId, { left: active.start.left + dx, top: active.start.top + dy })
  }
}

function finishTransform(event: PointerEvent) {
  const active = transform
  transform = null
  if (!active?.moved || active.edges.length > 0 || active.absolute) return

  const node = getNode(active.nodeId)
  if (!node?.parentId) return

  const index = insertionIndex(node, { x: event.clientX, y: event.clientY })
  // Its own index doubles as the no-op case: reinserting a node at the
  // position it already occupies would churn two arrays for nothing.
  const current = getNode(node.parentId)?.childrenIds.indexOf(node.id) ?? -1
  if (index !== current) moveNode(node.id, node.parentId, index)
}

/** Abandons a gesture, putting back the pins it had already overwritten. */
function cancelTransform() {
  const active = transform
  transform = null
  if (active?.moved && (active.edges.length > 0 || active.absolute)) {
    updateGeometry(active.nodeId, active.restore)
  }
}

function handleHandleDown(event: PointerEvent, handle: SelectionHandle) {
  const id = selectedId.value
  if (!id) return

  // Stops the workspace's own handler treating this as a press on empty
  // canvas — the handles are overlay siblings, not inside any node, so it
  // would otherwise clear the very selection being resized.
  event.stopPropagation()
  event.preventDefault()

  beginTransform(event, id, handle.edges)
}

function handlePointerDown(event: PointerEvent) {
  // Both paths below call preventDefault to stop a native text selection
  // dragging out behind the gesture — and that also suppresses the focus
  // change a press would normally cause. Without moving focus here, it
  // stays wherever it was: type in an inspector field, click the canvas,
  // and every tool shortcut would still be swallowed by that field.
  workspace.value?.focus()

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
    const id = resolveSelectionTarget(event)
    selectNode(id)

    // Selecting and moving are one gesture: press picks the element up,
    // and it only actually moves once the pointer clears MIN_DRAG, so a
    // plain click still just selects.
    if (id) {
      // Suppresses the native text selection that would otherwise drag
      // out behind the element.
      event.preventDefault()
      beginTransform(event, id, [])
    }
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

  capturePointer(event.pointerId)
}

function handlePointerMove(event: PointerEvent) {
  if (transform) {
    applyTransform(event)
    return
  }

  if (!dragOrigin.value) return
  dragCurrent.value = { x: event.clientX, y: event.clientY }
}

function handlePointerUp(event: PointerEvent) {
  if (transform) {
    finishTransform(event)
    releasePointer(event.pointerId)
    return
  }

  const tool = activeTool.value
  const geometry = geometryFor(dropTargetNode.value)

  if (tool && geometry && geometry.width >= MIN_DRAG && geometry.height >= MIN_DRAG) {
    // A frame that imposes a layout places its own children, so the drawn
    // offsets would be inert — only the size survives. Emitting left/top
    // there would put values in the inspector the browser ignores.
    const placed =
      dropTargetLayout.value === 'none'
        ? geometry
        : { width: geometry.width, height: geometry.height }

    const created = addNode(tool.creates, { ...tool.seedInit(), ...placed }, dropTargetId.value)
    // Hand the new element to the inspector — the tool disarms below, so
    // we land in select mode with the thing just drawn already selected.
    selectNode(created.id)
    // One draw per arming: the tool releases itself rather than staying
    // armed for another.
    disarm()
  }

  releasePointer(event.pointerId)
  clearDrag()
}

/** Abandons every gesture at once — Escape means "none of this". */
function cancelGestures() {
  cancelTransform()
  clearDrag()
}

useCanvasShortcuts({
  onEscape: () => {
    disarm()
    cancelGestures()
  },
  onDelete: () => {
    // A gesture in flight is abandoned first: deleting the node it was
    // transforming would otherwise leave the gesture writing geometry to
    // an id that no longer exists.
    cancelGestures()
    if (selectedId.value) removeNode(selectedId.value)
  },
})
</script>

<template>
  <div
    ref="workspace"
    class="workspace"
    :class="{ 'workspace--armed': activeTool !== null }"
    tabindex="-1"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="cancelGestures"
    @dragstart.prevent
    @selectstart.prevent
  >
    <!-- No @click here: selection is delegated to the root handler so the
         innermost element wins, and so this stays a single-prop component
         that can skip re-rendering. -->
    <!-- One root: the viewport. Everything else descends from it, so
         there is no "no parent" case anywhere downstream. -->
    <NodeRenderer :node-id="VIEWPORT_ID" />

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
      element — see the comment on selectionRect for why. The frame itself
      stays transparent to the pointer so it never blocks a click on what
      it surrounds; only the handles take events back.
    -->
    <div v-if="selectionFrameStyle" class="workspace__selection" :style="selectionFrameStyle">
      <span
        v-for="handle in SELECTION_HANDLES"
        :key="handle.name"
        :data-handle="handle.name"
        class="workspace__handle"
        :class="handle.corner ? 'workspace__handle--corner' : 'workspace__handle--edge'"
        :style="{ '--handle-x': handle.x, '--handle-y': handle.y, cursor: handle.cursor }"
        @pointerdown="handleHandleDown($event, handle)"
      />
    </div>
  </div>
</template>

<style scoped>
.workspace {
  position: relative;
  min-height: 100vh;
}

/* Focused programmatically on press, so canvas shortcuts stop landing in
   whichever inspector field was last typed in. `tabindex="-1"` keeps it
   out of the tab order, so this is never a keyboard destination and needs
   no ring — the selection frame already says what is focused. */
.workspace:focus {
  outline: none;
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
 * selectionRect in the script). The frame spans the element it surrounds,
 * so it must not swallow pointer events; the handles opt back in below.
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
  /* Back on, against the frame's `none` — these are the one interactive
     part of the overlay. */
  pointer-events: auto;
}

/* While a tool is armed the gesture is drawing, not resizing, so the
   handles step out of the way entirely rather than intercepting a drag
   that starts on top of one. */
.workspace--armed .workspace__handle {
  pointer-events: none;
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
