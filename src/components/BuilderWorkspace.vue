<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useEventListener } from '@vueuse/core'

import NodeRenderer from '@/components/NodeRenderer.vue'
import {
  measureNodeRect,
  nodeElement,
  toCanvasLocal,
  toLocal,
  type Rect,
} from '@/composables/nodeMeasure'
import {
  canvasTransform,
  pan,
  panBy,
  toCanvasDelta,
  toCanvasPoint,
  zoom,
  zoomBy,
  type ViewPoint,
} from '@/composables/useCanvasView'
import { onResizeFrame } from '@/composables/useViewport'
import { toWorkspacePoint, useWorkspaceRect } from '@/composables/useWorkspaceRect'
import { SHORTCUT_BOUNDARY, useCanvasShortcuts } from '@/composables/useCanvasShortcuts'
import { useTools } from '@/composables/useTools'
import {
  PIN_KEY,
  VIEWPORT_HEIGHT,
  VIEWPORT_ID,
  VIEWPORT_WIDTH,
  aspectRatioOf,
  getNode,
  isViewport,
  resolvedPosition,
  stretchesAxis,
  useCanvasNodes,
  type CanvasNode,
  type Edge,
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

/**
 * The viewport's own screen box.
 *
 * Computed directly from `pan`/`zoom` and the node's own stored geometry
 * rather than measured, unlike every other overlay here: there is nothing
 * a DOM read could tell this that the view state and the node do not
 * already say between them, and it means the label tracks a move or a
 * resize with no watcher of its own to keep in sync.
 */
const viewportScreenRect = computed(() => {
  const node = getNode(VIEWPORT_ID)
  return {
    left: pan.value.x + (node?.left ?? 0) * zoom.value,
    top: pan.value.y + (node?.top ?? 0) * zoom.value,
    width: (node?.width ?? VIEWPORT_WIDTH) * zoom.value,
    height: (node?.height ?? VIEWPORT_HEIGHT) * zoom.value,
  }
})

const viewportLabel = computed(() => {
  const node = getNode(VIEWPORT_ID)
  return `Page · ${node?.width ?? VIEWPORT_WIDTH} × ${node?.height ?? VIEWPORT_HEIGHT}`
})

/** The bar's own height — fixed screen chrome, never scaled by zoom. */
const VIEWPORT_BAR_HEIGHT = 28

/**
 * Clear space between the bar and the frame's top edge.
 *
 * The bar reads as a tab belonging to the frame rather than part of its
 * content, which is what the separation buys: flush against the edge, it
 * looked like a header *inside* the page being designed. Screen pixels,
 * not canvas ones, so the separation stays visually constant at every
 * zoom rather than collapsing to nothing when zoomed out.
 */
const VIEWPORT_BAR_GAP = 8

/**
 * The whole bar — its height plus the gap under it — is what has to fit
 * above the frame for it to sit there.
 */
const VIEWPORT_BAR_OFFSET = VIEWPORT_BAR_HEIGHT + VIEWPORT_BAR_GAP

/**
 * Floated above the frame whenever there is room, and tucked just inside
 * its top edge when there is not.
 *
 * The fallback matters more than it looks: "room above" is relative to
 * wherever the design happens to sit, and `fitToDocument` centres it
 * against the canvas cell's own top on load — so a frame with no space
 * above it is the *default* state, not an edge case. Without the fallback
 * the bar would spend that whole time clipped off the top of the canvas,
 * taking the only way to select the viewport with it.
 */
const viewportBarStyle = computed(() => {
  const rect = viewportScreenRect.value
  const hasRoomAbove = rect.top >= VIEWPORT_BAR_OFFSET
  return {
    left: `${rect.left}px`,
    top: `${hasRoomAbove ? rect.top - VIEWPORT_BAR_OFFSET : rect.top + VIEWPORT_BAR_GAP}px`,
    width: `${rect.width}px`,
    height: `${VIEWPORT_BAR_HEIGHT}px`,
  }
})

const workspace = useTemplateRef<HTMLElement>('workspace')

// Publishes where the canvas cell sits, which is what lets a client
// coordinate be compared against `pan`. Registered here because this
// component owns the element.
useWorkspaceRect(workspace)

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

// Deliberately no watcher on the canvas cell's own size. A rail widening
// moves the whole canvas, but every overlay here is measured *relative to
// it* — so nothing they depend on has changed, and re-measuring would
// produce the numbers already on screen. What does have to react is the
// cell's origin and size themselves, which  observes.

// Panning or zooming moves every node's on-screen box without moving the
// node itself — `measureSelection` reads real rendered pixels, so without
// this the frame and its handles would stay frozen at wherever they were
// before the view last changed. Throttled for the same reason as resize:
// `pan` writes on every pointermove of a pan gesture.
//
// flush: 'post', for the same reason as the selection watcher above: a
// 'pre' watcher runs before `.workspace__canvas`'s own `:style` binding
// has been patched into the DOM, so it would measure the transform that
// is about to be replaced, not the one just written.
watch(canvasTransform, onResizeFrame(measureSelection), { flush: 'post' })

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

interface EdgeStrip {
  edge: Edge
  cursor: string
}

/**
 * A wide hit strip running the full length of each side, so grabbing a
 * resize is not confined to the four small dots at each edge's midpoint.
 *
 * Deliberately separate elements from `SELECTION_HANDLES` rather than
 * stretching those: a corner must stay a small, precise target for its
 * own diagonal resize, so each strip has to stop short of the corners —
 * simplest as its own element sized independently, not as a variant of a
 * dot that already means something else at 0%/100%.
 */
const EDGE_STRIPS = [
  { edge: 'top', cursor: 'ns-resize' },
  { edge: 'right', cursor: 'ew-resize' },
  { edge: 'bottom', cursor: 'ns-resize' },
  { edge: 'left', cursor: 'ew-resize' },
] as const satisfies readonly EdgeStrip[]

/**
 * Held to pan by dragging, the way space-drag works in every other canvas
 * tool. Tracked on `window`, not the workspace, so releasing it outside
 * the canvas (over a panel, say) still lands — a stuck-down space would
 * otherwise turn every later click into a pan.
 */
const spaceHeld = ref(false)

/** Only for the cursor: `panGesture` below is a plain, non-reactive `let`. */
const isPanning = ref(false)

function insideChrome(event: Event): boolean {
  return event.target instanceof Element && event.target.closest(`[${SHORTCUT_BOUNDARY}]`) !== null
}

function handleSpaceDown(event: KeyboardEvent) {
  // A space typed into a field is text, not a request to pan — same
  // boundary the tool shortcuts respect.
  if (event.code !== 'Space' || insideChrome(event)) return
  event.preventDefault()
  spaceHeld.value = true
}

function handleSpaceUp(event: KeyboardEvent) {
  if (event.code === 'Space') spaceHeld.value = false
}

useEventListener(window, 'keydown', handleSpaceDown)
useEventListener(window, 'keyup', handleSpaceUp)

/** A pan drag in progress — mirrors `transform`'s non-reactive posture. */
let panGesture: { origin: ViewPoint; startPan: ViewPoint } | null = null

function beginPan(event: PointerEvent) {
  panGesture = { origin: { x: event.clientX, y: event.clientY }, startPan: { ...pan.value } }
  isPanning.value = true
  capturePointer(event.pointerId)
}

function applyPan(event: PointerEvent) {
  if (!panGesture) return
  pan.value = {
    x: panGesture.startPan.x + (event.clientX - panGesture.origin.x),
    y: panGesture.startPan.y + (event.clientY - panGesture.origin.y),
  }
}

function endPan(event: PointerEvent) {
  panGesture = null
  isPanning.value = false
  releasePointer(event.pointerId)
}

/** A wheel notch's worth of zoom change, tuned so a few notches feel like a step. */
const ZOOM_WHEEL_SENSITIVITY = 0.01

function handleWheel(event: WheelEvent) {
  event.preventDefault()
  // A position, not a delta, so it needs rebasing onto the cell before
  // `zoomBy` can solve `pan` against it — otherwise zooming drifts by the
  // width of the left rail on every notch.
  const anchor = toWorkspacePoint({ x: event.clientX, y: event.clientY })

  if (event.ctrlKey) {
    // Trackpad pinch is reported as a wheel event with `ctrlKey` set —
    // there is no separate pinch event on the web, and this is the
    // convention every other web canvas (Figma, Google Maps) reads it by.
    zoomBy(Math.exp(-event.deltaY * ZOOM_WHEEL_SENSITIVITY), anchor)
    return
  }

  panBy(-event.deltaX, -event.deltaY)
}

/**
 * Below this, a drag is treated as a stray click rather than an intent
 * to draw — without it, an ordinary click (a 0x0 drag) would litter the
 * workspace with invisible elements.
 */
const MIN_DRAG = 4

const dragOrigin = ref<{ x: number; y: number } | null>(null)
const dragCurrent = ref<{ x: number; y: number } | null>(null)

/**
 * The drawn rectangle in **client** coordinates, normalised so a drag in
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
 * The drawn rectangle expressed **relative to the frame receiving it**, in
 * canvas pixels.
 *
 * Absolute offsets resolve against the containing block, which is the
 * target frame — so the client-space pointer coordinates have to be
 * rebased onto it, or every nested node would be positioned as though it
 * sat at the page origin. `dragRect` is real client pixels either way
 * (both corners came straight from `event.clientX/clientY`), so the
 * result needs converting to canvas units regardless of which branch
 * below runs — only *what it is rebased onto* differs.
 */
function geometryFor(target: HTMLElement | null) {
  const rect = dragRect.value
  if (!rect) return null

  // No frame under the drag: it lands directly on the canvas, so the rect
  // is rebased onto the canvas's own origin instead of a node's — there is
  // no element here for `toCanvasLocal` to measure against.
  let local: Rect
  if (target) {
    local = toCanvasLocal(rect, target)
  } else {
    const origin = toCanvasPoint(toWorkspacePoint({ x: rect.left, y: rect.top }))
    local = {
      left: origin.x,
      top: origin.y,
      width: rect.width / zoom.value,
      height: rect.height / zoom.value,
    }
  }

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
  /**
   * The locked width-to-height ratio, or null. Read once at the start
   * like `absolute`: a gesture cannot engage or release the lock, and
   * re-reading it from the sizes this very drag is writing would have it
   * hold whatever the last frame produced.
   */
  ratio: number | null
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
  if (!node) return

  const measured = measureNodeRect(nodeId)
  const isMove = edges.length === 0

  // A resize releases the opposite edge only when it's actually pinned —
  // dragging a handle on an already near-only box has nothing to give up.
  // A move releases any far-edge pin outright: it is establishing a fresh
  // left/top position regardless of which edge used to anchor the box,
  // the same as drawing or leaving the flow always does.
  const released = isMove
    ? (['right', 'bottom'] as const).filter((edge) => node[PIN_KEY[edge]] === true)
    : edges.filter((edge) => node[PIN_KEY[OPPOSITE_EDGE[edge]]] === true)

  // Pinned, not merely present — a proportional or far-held edge can
  // still carry a stored number (a percentage, or an inert leftover)
  // that isn't the real on-screen position, so it falls back to a
  // measurement exactly as an edge with no stored number at all would.
  const start = {
    left: node.pinLeft ? (node.left ?? measured?.left ?? 0) : (measured?.left ?? 0),
    top: node.pinTop ? (node.top ?? measured?.top ?? 0) : (measured?.top ?? 0),
    width: startSize(node, measured, 'width'),
    height: startSize(node, measured, 'height'),
  }

  transform = {
    nodeId,
    edges,
    released,
    ratio: aspectRatioOf(node),
    absolute: resolvedPosition(node) === 'absolute',
    origin: { x: event.clientX, y: event.clientY },
    start,
    // All four pins and their flags, not just the origin pair: a gesture
    // can drop one, so cancelling has to be able to put it back exactly.
    restore: {
      left: node.left,
      right: node.right,
      top: node.top,
      bottom: node.bottom,
      width: node.width,
      height: node.height,
      pinLeft: node.pinLeft,
      pinRight: node.pinRight,
      pinTop: node.pinTop,
      pinBottom: node.pinBottom,
    },
    moved: false,
  }

  // Snapshotted above first, so Escape can restore what this drops. The
  // flag goes with the value — leaving it pinned while the number
  // underneath disappears would mislead the constraint widget about
  // which edge is actually anchoring the box.
  if (isMove) {
    // A move always states left/top outright — whatever was anchoring
    // the box before (a far edge, or nothing at all), the gesture is a
    // fresh, explicit position, same as drawing or leaving the flow.
    const patch: NodeGeometry = { pinLeft: true, pinTop: true }
    if (released.includes('right')) {
      patch.right = undefined
      patch.pinRight = false
      updateSizeMode(nodeId, 'width', 'fixed')
      patch.width = start.width
    }
    if (released.includes('bottom')) {
      patch.bottom = undefined
      patch.pinBottom = false
      updateSizeMode(nodeId, 'height', 'fixed')
      patch.height = start.height
    }
    updateGeometry(nodeId, patch)
  } else if (released.length > 0) {
    updateGeometry(
      nodeId,
      Object.fromEntries(
        released.flatMap((edge) => [
          [edge, undefined],
          [PIN_KEY[edge], false],
        ]),
      ) as NodeGeometry,
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
  const drags = (edge: Edge) => active.edges.includes(edge)

  let nextWidth = width
  let nextHeight = height
  if (drags('right')) nextWidth = Math.max(MIN_SIZE, width + dx)
  if (drags('left')) nextWidth = Math.max(MIN_SIZE, width - dx)
  if (drags('bottom')) nextHeight = Math.max(MIN_SIZE, height + dy)
  if (drags('top')) nextHeight = Math.max(MIN_SIZE, height - dy)

  const horizontal = drags('left') || drags('right')
  const vertical = drags('top') || drags('bottom')

  if (active.ratio !== null) {
    // A corner drags both axes at once, so the pointer picks which one
    // leads — whichever it has travelled furthest along. Deriving the same
    // axis every time would make half of every corner drag do nothing.
    if (horizontal && (!vertical || Math.abs(dx) >= Math.abs(dy))) {
      nextHeight = Math.max(MIN_SIZE, Math.round(nextWidth / active.ratio))
    } else {
      nextWidth = Math.max(MIN_SIZE, Math.round(nextHeight * active.ratio))
    }
  }

  // The origin only moves for an edge this gesture still holds. A
  // released one is now derived from the anchor opposite it, so writing
  // the pin back would stretch the box again on the very next frame.
  const holds = (edge: Edge) => active.absolute && !active.released.includes(edge)

  // Under a lock both axes are sized, since one follows the other.
  // Otherwise only the dragged one is — writing a size onto an axis the
  // gesture never touched would state a number for a `fill` or `fit` axis
  // that nothing asked for.
  const patch: NodeGeometry = {}
  if (horizontal || active.ratio !== null) {
    patch.width = nextWidth
    if (drags('left') && holds('left')) patch.left = left + (width - nextWidth)
  }
  if (vertical || active.ratio !== null) {
    patch.height = nextHeight
    if (drags('top') && holds('top')) patch.top = top + (height - nextHeight)
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
  // element would nudge it by whatever jitter the pointer had. Compared in
  // window pixels, not canvas ones — a stray flick of the hand is the same
  // stray flick regardless of zoom, which the resulting size is not.
  if (!active.moved && Math.abs(dx) < MIN_DRAG && Math.abs(dy) < MIN_DRAG) return
  active.moved = true

  // Only now converted: `start`, and everything `resizeGeometry` and the
  // move branch below add it to, are canvas units — dx/dy have to match.
  const canvasDelta = toCanvasDelta({ x: dx, y: dy })

  if (active.edges.length > 0) {
    // Dragging an edge states a size in pixels, so an axis that was
    // filling or fitting becomes fixed — at whatever it was measuring
    // when the gesture began, which `start` already holds.
    for (const [axis, sides] of RESIZE_AXES) {
      if (sides.some((side) => active.edges.includes(side))) {
        updateSizeMode(active.nodeId, axis, 'fixed')
      }
    }
    updateGeometry(active.nodeId, resizeGeometry(active, canvasDelta.x, canvasDelta.y))
    return
  }

  // A move only writes offsets for a node that positions itself. An
  // in-flow node is placed by its parent, so dragging it means reordering
  // it among its siblings — which is settled on release, from where the
  // pointer finally landed.
  if (active.absolute) {
    updateGeometry(active.nodeId, {
      left: active.start.left + canvasDelta.x,
      top: active.start.top + canvasDelta.y,
    })
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

/** Shared by the corner/edge dots and the edge strips — both just start a resize. */
function handleResizeDown(event: PointerEvent, edges: readonly Edge[]) {
  const id = selectedId.value
  if (!id) return

  // Stops the workspace's own handler treating this as a press on empty
  // canvas — the handles are overlay siblings, not inside any node, so it
  // would otherwise clear the very selection being resized.
  event.stopPropagation()
  event.preventDefault()

  beginTransform(event, id, edges)
}

function handlePointerDown(event: PointerEvent) {
  // Both paths below call preventDefault to stop a native text selection
  // dragging out behind the gesture — and that also suppresses the focus
  // change a press would normally cause. Without moving focus here, it
  // stays wherever it was: type in an inspector field, click the canvas,
  // and every tool shortcut would still be swallowed by that field.
  workspace.value?.focus()

  // Space-drag panning pre-empts drawing and selection both — it is a
  // navigation gesture, not one that acts on canvas content.
  if (spaceHeld.value) {
    event.preventDefault()
    beginPan(event)
    return
  }

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
    const target = resolveDropTarget(event)
    const targetId = target?.dataset.nodeId ?? null

    // A press on the viewport's own empty area — not on any child, which
    // `closest` would already have found first — drags it, but only once
    // it is already the selection. Pressing it cold still reads as
    // pressing bare canvas: it is reachable only from its own label, so a
    // stray click never grabs the whole document by accident the way it
    // would if this fell under the ordinary select-and-move rule below.
    if (isViewport(targetId) && selectedId.value === VIEWPORT_ID) {
      event.preventDefault()
      beginTransform(event, VIEWPORT_ID, [])
      return
    }

    const id = isViewport(targetId) ? null : targetId
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
  if (panGesture) {
    applyPan(event)
    return
  }

  if (transform) {
    applyTransform(event)
    return
  }

  if (!dragOrigin.value) return
  dragCurrent.value = { x: event.clientX, y: event.clientY }
}

function handlePointerUp(event: PointerEvent) {
  if (panGesture) {
    endPan(event)
    return
  }

  if (transform) {
    finishTransform(event)
    releasePointer(event.pointerId)
    return
  }

  const tool = activeTool.value
  const drawn = dragRect.value
  const geometry = geometryFor(dropTargetNode.value)

  // Gated on the drag as the pointer actually made it — window pixels —
  // not on `geometry`, which is canvas pixels: at any zoom other than
  // 100% the two disagree on how big a "stray click" is allowed to be,
  // and it is the hand's jitter this threshold exists to forgive.
  if (tool && drawn && geometry && drawn.width >= MIN_DRAG && drawn.height >= MIN_DRAG) {
    // A frame that imposes a layout places its own children, so the drawn
    // offsets would be inert — only the size survives. Emitting left/top
    // there would put values in the inspector the browser ignores.
    //
    // Drawing states a position, same as it always has — pinLeft/pinTop
    // are what make that explicit now, rather than left/top's mere
    // presence implying it.
    const placed =
      dropTargetLayout.value === 'none'
        ? { ...geometry, pinLeft: true, pinTop: true }
        : { width: geometry.width, height: geometry.height }

    const created = addNode(tool.creates, { ...tool.seedInit(), ...placed }, dropTargetId.value)

    // A tool that lays out children comes with children — see
    // `seedChildren`. Appended in order, and given no geometry: the frame
    // above places them, so anything positional here would be inert.
    for (const child of tool.seedChildren()) {
      addNode(tool.creates, child, created.id)
    }

    // Hand the new element to the inspector — the tool disarms below, so
    // we land in select mode with the thing just drawn already selected.
    // The frame that was drawn, not one of the children inside it.
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
  panGesture = null
  isPanning.value = false
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
    :class="{
      'workspace--armed': activeTool !== null,
      'workspace--pan-ready': spaceHeld,
      'workspace--panning': isPanning,
    }"
    tabindex="-1"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="cancelGestures"
    @wheel="handleWheel"
    @dragstart.prevent
    @selectstart.prevent
  >
    <!--
      Everything that is actually on the canvas lives inside this layer,
      which carries the one CSS transform that turns pan and zoom into
      what is on screen. `transform-origin: 0 0` in the stylesheet below
      is load-bearing: it is what makes `pan` mean "where canvas (0, 0)
      renders" rather than some other point on the layer — see
      `useCanvasView.ts`.

      Overlays (drop-target, selection) stay OUTSIDE this layer, in real
      screen pixels — see measureRect below for why that needs no extra
      work under zoom.
    -->
    <div class="workspace__canvas" :style="{ transform: canvasTransform }">
      <!-- No @click here: selection is delegated to the root handler so
           the innermost element wins, and so this stays a single-prop
           component that can skip re-rendering. -->
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

        The un-teleported fallback (no frame under the drag) stays inside
        this same transformed layer too — `ghostStyle` is canvas pixels
        either way, so both forms need the same layer to render at the
        right screen size and place.
      -->
      <Teleport v-if="dropTargetNode" :to="dropTargetNode">
        <div v-if="ghostStyle" class="workspace__ghost" :style="ghostStyle" />
      </Teleport>
      <div v-else-if="ghostStyle" class="workspace__ghost" :style="ghostStyle" />
    </div>

    <!--
      Selects the viewport — pressing it cold is pressing empty canvas
      (see handlePointerDown), so this bar is the only way in. Once
      selected, its own body becomes draggable, the same as any other
      frame. A bar attached above the frame, spanning its width, is where
      every other canvas tool puts a frame's name, so this doubles as
      that, ready for when more than one frame exists to tell apart.

      `.stop` on pointerdown keeps the workspace's own handler from ever
      seeing this press: unhandled, it would resolve to "outside any
      node" and clear the selection a moment before the click below sets
      it, relying on batching to land on the right answer instead of just
      being correct.
    -->
    <button
      type="button"
      class="workspace__viewport-bar"
      :class="{ 'workspace__viewport-bar--selected': selectedId === VIEWPORT_ID }"
      :style="viewportBarStyle"
      @pointerdown.stop
      @click="selectNode(VIEWPORT_ID)"
    >
      {{ viewportLabel }}
    </button>

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
      it surrounds; the strips and dots below take events back.
    -->
    <div v-if="selectionFrameStyle" class="workspace__selection" :style="selectionFrameStyle">
      <!-- Wide hit strips first, so the dots — smaller, and painted after
           — sit on top of them at each edge's midpoint and corner. Both
           do the same thing there, but the dots are what a corner's
           precise diagonal grab actually depends on. -->
      <span
        v-for="strip in EDGE_STRIPS"
        :key="strip.edge"
        :data-edge="strip.edge"
        class="workspace__edge-strip"
        :class="`workspace__edge-strip--${strip.edge}`"
        :style="{ cursor: strip.cursor }"
        @pointerdown="handleResizeDown($event, [strip.edge])"
      />
      <span
        v-for="handle in SELECTION_HANDLES"
        :key="handle.name"
        :data-handle="handle.name"
        class="workspace__handle"
        :class="handle.corner ? 'workspace__handle--corner' : 'workspace__handle--edge'"
        :style="{ '--handle-x': handle.x, '--handle-y': handle.y, cursor: handle.cursor }"
        @pointerdown="handleResizeDown($event, handle.edges)"
      />
    </div>
  </div>
</template>

<style scoped>
/* Fills its cell, and never scrolls: an infinite canvas navigates
   entirely through its own pan and zoom, so `overflow: hidden` is what
   stops a stray native scroll from fighting that.

   Absolutely positioned rather than being the grid item itself, so it
   stays a positioned ancestor — `.workspace__canvas`, the viewport bar,
   the drop target and the selection frame all position against it, and a
   static grid item would send all four out to the page instead.

   Nothing depends on where this sits any more: pointer positions are
   rebased through `toWorkspacePoint` and "fit" sizes itself from
   `workspaceSize`, both of which measure this element rather than assume
   it starts at the window's corner. */
.workspace {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

/* Untransformed by default: `pan` starts at `{ x: 0, y: 0 }`, and this is
   what makes that mean "canvas (0, 0) renders at the workspace's own
   top-left" — see the transform-origin comment in the template. */
.workspace__canvas {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
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

/* Space held: panning is one press away, same convention as every other
   canvas tool. Actually panning swaps to `grabbing`, matching the cursor
   the OS itself uses while a window is being dragged. */
.workspace--pan-ready {
  cursor: grab;
}

.workspace--panning {
  cursor: grabbing;
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

/* A detached tab floating above the frame and spanning its width — its
   `left`, `top` and `width` all come from `viewportBarStyle`, including
   the gap that separates it (see VIEWPORT_BAR_GAP there). Rounded on all
   four corners because it is detached: rounding only the top would imply
   it was joined to something below it.

   `height` is fixed and never scaled by zoom — chrome, not canvas
   content, the same posture as the selection handles — and
   `box-sizing: border-box` keeps the border counted inside that height
   rather than adding to it, so the gap stays the size it says it is. */
.workspace__viewport-bar {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 0 0.625rem;
  font-size: 0.75rem;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--color-fg-muted);
  background-color: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  cursor: pointer;
}

.workspace__viewport-bar:hover {
  color: var(--color-fg-default);
  border-color: var(--color-border-strong);
}

.workspace__viewport-bar--selected {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
  border-color: var(--color-accent);
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

/*
 * A wide, invisible strip along each edge, so grabbing a resize works
 * anywhere along the border — not just the small dot at its midpoint.
 *
 * Inset from the corners by 10px on the strip's own long axis, so a
 * corner stays the dot's alone: dragging near one always resizes both
 * adjoining edges together, which a strip reaching all the way to the
 * corner would make ambiguous with a single-edge drag starting right
 * beside it.
 *
 * Centred on the border line the same way the dots are, via `translate`
 * on the cross axis — an 8px hit width is comfortably grabbable without
 * visibly widening the 1px line it centres on.
 */
.workspace__edge-strip {
  position: absolute;
  pointer-events: auto;
}

.workspace--armed .workspace__edge-strip {
  pointer-events: none;
}

.workspace__edge-strip--top,
.workspace__edge-strip--bottom {
  left: 10px;
  right: 10px;
  height: 8px;
}

.workspace__edge-strip--left,
.workspace__edge-strip--right {
  top: 10px;
  bottom: 10px;
  width: 8px;
}

.workspace__edge-strip--top {
  top: 0;
  translate: 0 -50%;
}

.workspace__edge-strip--bottom {
  bottom: 0;
  translate: 0 50%;
}

.workspace__edge-strip--left {
  left: 0;
  translate: -50% 0;
}

.workspace__edge-strip--right {
  right: 0;
  translate: 50% 0;
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
