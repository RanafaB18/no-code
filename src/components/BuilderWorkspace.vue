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
import { beginDrag, dragOffset, draggingId, endDrag } from '@/composables/useCanvasDrag'
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
import { STACK_GAP, useTools } from '@/composables/useTools'
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
 * Zero: the frame sits exactly on the edge it is reporting, so what is
 * highlighted is the box itself rather than a slightly larger one. An
 * offset frame quietly misstates the element's size — which matters most
 * on the small elements where four pixels are a visible fraction of it.
 *
 * Kept as a named constant rather than inlined because the resize handles
 * are placed along this same frame, so anything that moves it moves where
 * they can be grabbed.
 */
const SELECTION_GAP = 0

/**
 * Hidden while a frame is being dragged.
 *
 * The frame is measured from the element, and a dragged frame follows the
 * pointer without the measurement being redone — so it would sit at the
 * origin with its handles around empty space. There is nothing useful to
 * show anyway: what matters mid-drag is where the frame will land, which
 * the drop-target border and the insertion line say. A resize keeps it,
 * since that is the gesture the handles belong to.
 */
const selectionFrameStyle = computed(() =>
  draggingId.value === null ? frameStyle(selectionRect.value, SELECTION_GAP) : null,
)

/**
 * The frame a new element will be nested into, re-resolved as the drag
 * grows.
 *
 * Tracked live rather than fixed at pointerdown, because the answer
 * depends on the whole drawn rectangle and not on where it started —
 * see `frameContaining`. That also sidesteps what forced the old
 * pointerdown-only rule: `setPointerCapture` retargets every later event
 * to the capture element, so `event.target` on pointermove is always the
 * workspace root and `closest()` can tell you nothing.
 *
 * The node is kept alongside the id because the ghost teleports into it.
 */
const dropTargetId = ref<string | null>(null)
const dropTargetNode = ref<HTMLElement | null>(null)
const dropRect = ref<Rect | null>(null)

/** Drawn flush, so it reads as an inner fill inside any selection frame. */
const dropFrameStyle = computed(() => frameStyle(dropRect.value, 0))

/**
 * Where a dragged frame started, so the slot it is leaving stays visible
 * behind it. Cleared the moment the gesture ends, either way.
 */
const dragOriginRect = ref<Rect | null>(null)

const dragOriginStyle = computed(() => frameStyle(dragOriginRect.value, 0))

/**
 * The line marking where a dragged frame will be inserted among the
 * receiving frame's children, in workspace px.
 *
 * Only for a frame that lays its children out: order is what the line is
 * about, and a frame that positions its children has none to show.
 */
const insertionStyle = ref<Record<string, string> | null>(null)

/**
 * What releasing here would actually do.
 *
 * Resolved once while the drag is live and read back on release, so the
 * line on screen and the change to the document cannot disagree — the
 * same single-source rule the drop target itself already follows.
 */
type DropIntent =
  | { kind: 'insert'; parentId: NodeId; index: number }
  | {
      kind: 'wrap'
      targetId: NodeId
      direction: 'row' | 'column'
      before: boolean
      align: 'flex-start' | 'center' | 'flex-end'
    }

const dropIntent = ref<DropIntent | null>(null)

/**
 * Whether this parent's children run side by side rather than stacked.
 *
 * Reading two real siblings' relative position rather than the parent's
 * own `flex-direction`, so one rule covers a row, a column and a grid
 * alike — their separation is the ground truth regardless of which of
 * the three produced it.
 *
 * Deliberately *any* two siblings, not only the ones either side of the
 * insertion point: with only one neighbour to go on there — inserting at
 * the very start or end of the list — the previous version fell back to
 * that single box's own aspect ratio, which is a guess about the row
 * from the shape of one item in it. A two-column flex row with a modest
 * width and a generous height produces children taller than they are
 * wide, and the guess called that a column. Two siblings from anywhere in
 * the list settle it directly; with only one child total there is truly
 * nothing to compare, so it falls back to the parent's own direction —
 * `column` for a flex frame that says so, `row` otherwise, the same
 * default the inspector now shows for an unset one.
 */
function layoutIsHorizontal(parent: CanvasNode, siblings: readonly Rect[]): boolean {
  if (siblings.length >= 2) {
    const [a, b] = siblings
    return Math.abs(b!.left - a!.left) >= Math.abs(b!.top - a!.top)
  }
  return parent.styles.flexDirection !== 'column'
}

/** True when the pointer is on or within `reach` of the element's box. */
function coversPoint(element: HTMLElement, point: ViewPoint, reach = 0): boolean {
  const box = element.getBoundingClientRect()
  return (
    point.x >= box.left - reach &&
    point.x <= box.right + reach &&
    point.y >= box.top - reach &&
    point.y <= box.bottom + reach
  )
}

/**
 * The innermost stack whose borders the pointer could be on.
 *
 * Borders come from the cursor, not from the dragged box: a frame dropped
 * against a row's outer border deliberately hangs outside the row, so
 * containment can never name the row and would send the frame to the page
 * instead. What the box is *inside* still decides nesting; this decides
 * whose borders are on offer.
 *
 * Grown by the same reach the borders themselves use, or the outer ones
 * would be unreachable from the only side you can approach them from.
 */
function stackNear(point: ViewPoint, skipId: NodeId | null): CanvasNode | null {
  const root = nodeElement(VIEWPORT_ID)
  if (!root || !coversPoint(root, point, BOUNDARY_REACH)) return null

  let found: CanvasNode | null = null
  let id: NodeId = VIEWPORT_ID

  descend: for (;;) {
    const current = getNode(id)
    if (current && current.layout !== 'none') found = current

    for (const childId of current?.childrenIds ?? []) {
      if (childId === skipId) continue
      const child = nodeElement(childId)
      if (child && coversPoint(child, point, BOUNDARY_REACH)) {
        id = childId
        continue descend
      }
    }

    return found
  }
}

/** True when `node` sits somewhere beneath `ancestorId`. */
function isBeneath(node: CanvasNode, ancestorId: NodeId): boolean {
  let current = getNode(node.parentId)
  while (current) {
    if (current.id === ancestorId) return true
    current = getNode(current.parentId)
  }
  return false
}

/**
 * How near a border the pointer has to be to hit it, in workspace px.
 *
 * A border has no width, so intersecting one exactly is not something a
 * hand can do. Same forgiveness as `MIN_DRAG` and `CONTAINMENT_SLACK`,
 * and small enough that the middle of a cell hits nothing at all — which
 * is the state that lets a frame be dropped straight onto the page while
 * the pointer is over a stack.
 */
const BOUNDARY_REACH = 8

/**
 * A border a dragged frame can be dropped against.
 *
 * `offset` is where the line sits across its own direction; `from`/`to`
 * are its ends along that direction. Both in workspace px.
 *
 * A stack can express some of these and not others. Along its main axis
 * it can put a child anywhere in the order, so those borders `insert`.
 * Across that axis it cannot put a child at all — a row has no "below" to
 * place anything in — so its own two outer borders `wrap`, in a new stack
 * running the other way.
 */
interface Boundary {
  offset: number
  from: number
  to: number
  horizontal: boolean
  intent: DropIntent
}

/** Where along a cross-axis border the drop landed, and what that means. */
const ALIGNMENTS = ['flex-start', 'center', 'flex-end'] as const

/**
 * Every border of a laid-out frame that a frame can be dropped against.
 *
 * Main-axis borders sit where its children actually meet — the parent's
 * own near and far edges, and the far edge of every child but the last.
 * The gaps between children are not targets and never were: a gap is
 * space, the border is the thing, which is why a stack with no gap at all
 * still takes an insertion.
 *
 * Cross-axis borders are the parent's own two edges, each divided into
 * three along its length. A row cannot place a child above or below
 * itself, so dropping there wraps — and which third was hit says where
 * the new stack should align what it now holds.
 */
function boundariesOf(
  parent: CanvasNode,
  parentRect: Rect,
  siblings: readonly Rect[],
  horizontal: boolean,
): Boundary[] {
  const near = (rect: Rect) => (horizontal ? rect.left : rect.top)
  const far = (rect: Rect) => (horizontal ? rect.left + rect.width : rect.top + rect.height)
  const crossNear = (rect: Rect) => (horizontal ? rect.top : rect.left)
  const crossFar = (rect: Rect) => (horizontal ? rect.top + rect.height : rect.left + rect.width)

  const boundaries: Boundary[] = []

  // Along the main axis. A line here runs across the flow and spans the
  // whole border, because it is dividing the row rather than describing
  // the frame arriving.
  const insertAt = (offset: number, index: number) =>
    boundaries.push({
      offset,
      from: crossNear(parentRect),
      to: crossFar(parentRect),
      horizontal: !horizontal,
      intent: { kind: 'insert', parentId: parent.id, index },
    })

  insertAt(near(parentRect), 0)
  siblings.forEach((child, index) => {
    if (index < siblings.length - 1) insertAt(far(child), index + 1)
  })
  insertAt(far(parentRect), siblings.length)

  // Across it. Split in three, so the line is short enough to say which
  // way the new stack will align what it wraps.
  const direction: 'row' | 'column' = horizontal ? 'column' : 'row'
  // These lie across the flow, so they sit at the parent's cross-axis
  // edges and run along its main axis — the opposite pairing to the
  // insert borders above, which is easy to get backwards.
  const span = far(parentRect) - near(parentRect)

  for (const before of [true, false]) {
    const offset = before ? crossNear(parentRect) : crossFar(parentRect)

    ALIGNMENTS.forEach((align, third) => {
      boundaries.push({
        offset,
        from: near(parentRect) + (span / 3) * third,
        to: near(parentRect) + (span / 3) * (third + 1),
        horizontal,
        intent: { kind: 'wrap', targetId: parent.id, direction, before, align },
      })
    })
  }

  return boundaries
}

/**
 * The border the pointer is actually on, or null.
 *
 * Nothing is chosen by being nearest: the pointer has to be within reach
 * of the border *and* alongside it. Miss every border — the middle of a
 * cell, say — and there is no insertion to offer, which is what lets the
 * frame land on the page instead.
 */
function boundaryAt(boundaries: readonly Boundary[], point: ViewPoint): Boundary | null {
  let best: Boundary | null = null
  let bestDistance = Infinity

  for (const boundary of boundaries) {
    const across = boundary.horizontal ? point.y : point.x
    const along = boundary.horizontal ? point.x : point.y

    const distance = Math.abs(across - boundary.offset)
    if (distance > BOUNDARY_REACH) continue
    if (along < boundary.from || along > boundary.to) continue

    if (distance < bestDistance) {
      best = boundary
      bestDistance = distance
    }
  }

  return best
}

/** The line itself: lying along the border it has snapped to. */
function insertionLine(boundary: Boundary): Record<string, string> {
  if (boundary.horizontal) {
    return {
      left: `${boundary.from}px`,
      top: `${boundary.offset}px`,
      width: `${boundary.to - boundary.from}px`,
    }
  }

  return {
    left: `${boundary.offset}px`,
    top: `${boundary.from}px`,
    height: `${boundary.to - boundary.from}px`,
  }
}

/**
 * How far a box may overhang a frame and still count as inside it, in
 * screen px.
 *
 * Exact containment reads well until you try to fill a frame: a child the
 * same height as its parent has to be drawn onto both edges at once, and
 * a hand cannot do that — a pixel proud of the top and the frame silently
 * refuses it, leaving the element a sibling of the frame it was drawn
 * onto. Fractional zoom makes it worse, since the edge is then not on a
 * whole pixel at all.
 *
 * Screen px rather than canvas px, and the same size as `MIN_DRAG`, for
 * the same reason: this forgives the hand, and the hand is no steadier at
 * one zoom than another. Small enough that the deliberate act of drawing
 * across a frame's edge — which is how you place something beside it —
 * still reads as crossing.
 */
const CONTAINMENT_SLACK = 4

/** True when `rect` (client px) fits within the element's box, near enough. */
function encloses(element: HTMLElement, rect: Rect): boolean {
  const box = element.getBoundingClientRect()
  return (
    rect.left >= box.left - CONTAINMENT_SLACK &&
    rect.top >= box.top - CONTAINMENT_SLACK &&
    rect.left + rect.width <= box.right + CONTAINMENT_SLACK &&
    rect.top + rect.height <= box.bottom + CONTAINMENT_SLACK
  )
}

/**
 * The innermost frame satisfying `matches`, or null for bare canvas.
 *
 * Last child first, because later siblings paint over earlier ones — the
 * same rule the eye is applying while it watches. `skipId` is left out
 * along with its whole subtree, since the descent never gets past it: a
 * frame being moved cannot land inside itself.
 */
function innermostFrame(
  matches: (element: HTMLElement) => boolean,
  skipId: NodeId | null = null,
): HTMLElement | null {
  const root = nodeElement(VIEWPORT_ID)
  if (!root || !matches(root)) return null

  let element = root
  let id: NodeId = VIEWPORT_ID

  descend: for (;;) {
    const children = getNode(id)?.childrenIds ?? []

    for (let i = children.length - 1; i >= 0; i -= 1) {
      const childId = children[i]!
      if (childId === skipId) continue

      const child = nodeElement(childId)
      if (child && matches(child)) {
        id = childId
        element = child
        continue descend
      }
    }

    return element
  }
}

/**
 * The frame a box belongs to: the innermost one containing it. One rule
 * for both gestures — a box drawn and a frame dragged land in the same
 * place from the same position.
 *
 * Containment rather than what sits under the pointer, which is what lets
 * one gesture mean two things without a modifier: a box wholly inside a
 * frame goes into it, and the same box crossing that frame's edge is not
 * inside it any more, so it lands beside it instead. Across two children
 * of a row it belongs to neither and joins the row as their sibling —
 * which is also how a row is reordered, since a frame dragged along one
 * is inside the row but not inside any of its cells.
 *
 * That distinction is load-bearing now that the Flex and Grid tools seed
 * children which tile their parent completely: under a pointer rule there
 * would be nowhere left to press that meant "add another one".
 *
 * `encloses` carries the slack that makes "inside" reachable by hand —
 * without it a frame the exact size of its target could never be dropped
 * into it, since a box only contains an equal box when the two align to
 * the pixel.
 */
function frameContaining(rect: Rect, skipId: NodeId | null = null): HTMLElement | null {
  return innermostFrame((element) => encloses(element, rect), skipId)
}

/**
 * Re-resolves what the drag is currently over. Called as the pointer
 * moves, not once at the start: the answer depends on the whole drawn
 * rectangle, which is not known until the drag ends.
 */
function updateDropTarget() {
  const rect = dragRect.value
  const target = rect && activeTool.value ? frameContaining(rect) : null

  dropTargetNode.value = target
  dropTargetId.value = target?.dataset.nodeId ?? null

  // The page is a legitimate target but never a highlighted one: outlining
  // the whole page says nothing you could not already see, and the ghost
  // sitting on bare page says where the element is going by itself.
  dropRect.value = isViewport(dropTargetId.value) ? null : measureRect(dropTargetId.value)
}

/** The innermost element under the pointer — for selecting, not drawing. */
function elementUnder(event: PointerEvent): HTMLElement | null {
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

/**
 * The size being drawn, in canvas units — the number that will be stored,
 * not the pixels currently on screen, so it stays the same at every zoom.
 */
const ghostLabel = computed(() => {
  const geometry = geometryFor(dropTargetNode.value)
  if (!geometry) return null
  return `${Math.round(geometry.width)} × ${Math.round(geometry.height)}`
})

/** Clear space between the drawn box and the readout below it, in px. */
const GHOST_LABEL_GAP = 6

/**
 * Where that readout sits, in workspace pixels.
 *
 * Rendered outside the canvas layer, unlike the ghost it belongs to: this
 * is a readout rather than part of the drawing, so it has to stay its own
 * size and the right way up however far the canvas is zoomed.
 */
const ghostLabelStyle = computed(() => {
  const rect = dragRect.value
  if (!rect || !ghostLabel.value) return null

  const corner = toWorkspacePoint({ x: rect.left + rect.width, y: rect.top + rect.height })
  return { left: `${corner.x}px`, top: `${corner.y + GHOST_LABEL_GAP}px` }
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
 * The dragged frame's box when the gesture began, in client px.
 *
 * Where it is *now* is this plus the pointer's travel, computed rather
 * than measured: a frame its parent places follows the pointer by a
 * transform Vue has not applied yet at the moment the pointer moves, so
 * measuring would answer for the previous frame of the drag.
 */
let dragOriginClient: Rect | null = null

/** Where the dragged frame has got to, in client px. */
function draggedRect(dx: number, dy: number): Rect | null {
  if (!dragOriginClient) return null
  return {
    ...dragOriginClient,
    left: dragOriginClient.left + dx,
    top: dragOriginClient.top + dy,
  }
}

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

  const absolute = resolvedPosition(node) === 'absolute'

  if (isMove) {
    beginDrag(nodeId)

    // Only for a frame its parent places. That one follows the pointer by
    // a transform, so its slot stays reserved behind it and the
    // placeholder marks something real. A frame that positions itself
    // moves for real and leaves nothing behind, so the same box would be
    // a stale copy of where it used to be and nothing more.
    //
    // Measured before anything moves, so it marks the slot the frame is
    // leaving rather than wherever it has got to since.
    dragOriginRect.value = absolute ? null : measureRect(nodeId)

    const box = nodeElement(nodeId)?.getBoundingClientRect()
    dragOriginClient = box
      ? { left: box.left, top: box.top, width: box.width, height: box.height }
      : null
  }

  transform = {
    nodeId,
    edges,
    released,
    ratio: aspectRatioOf(node),
    absolute,
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
 * Every child of `parent` except the one being moved, in client px.
 *
 * Measured in one pass and handed to both `insertionIndex` and
 * `insertionLine`, which need the same boxes and used to each go and find
 * them: two `document.querySelector`s and two layout reads per sibling,
 * on every pointermove of a drag. Read per move rather than cached at
 * gesture start because a drag can reorder the siblings under it, and a
 * stale set would place the line against boxes that had already moved.
 */
function siblingBoxes(parent: CanvasNode, movingId: NodeId): Rect[] {
  const boxes: Rect[] = []

  for (const siblingId of parent.childrenIds) {
    if (siblingId === movingId) continue

    const element = nodeElement(siblingId)
    if (!element) continue

    const box = element.getBoundingClientRect()
    boxes.push({ left: box.left, top: box.top, width: box.width, height: box.height })
  }

  return boxes
}

/**
 * Where a dragged node should land among its siblings.
 *
 * Reading order rather than a single axis, so one rule serves a row, a
 * column and a grid alike: a sibling comes before the drop when the
 * pointer is past its bottom edge entirely, or level with it and past its
 * midpoint.
 */
function insertionIndex(siblings: readonly Rect[], point: ViewPoint): number {
  let index = 0

  for (const box of siblings) {
    const bottom = box.top + box.height
    const level = point.y >= box.top && point.y <= bottom
    if (point.y > bottom || (level && point.x > box.left + box.width / 2)) index += 1
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
  // in-flow node is placed by its parent, so it follows the pointer by a
  // transform instead — its slot stays reserved behind it, which is what
  // the placeholder marks, and its siblings hold still.
  if (active.absolute) {
    updateGeometry(active.nodeId, {
      left: active.start.left + canvasDelta.x,
      top: active.start.top + canvasDelta.y,
    })
  } else {
    dragOffset.value = canvasDelta
  }

  updateMoveFeedback(active, draggedRect(dx, dy), { x: event.clientX, y: event.clientY })
}

/**
 * Keeps the drop-target highlight and the insertion line current while a
 * frame is being dragged — the move gesture's answer to the highlight
 * drawing already shows.
 */
function updateMoveFeedback(active: Transform, rect: Rect | null, point: ViewPoint) {
  if (!rect) return

  // Two questions, two rules. What the box is wholly *inside* decides
  // nesting; where the cursor is decides whose borders are on offer.
  const contained = getNode(frameContaining(rect, active.nodeId)?.dataset.nodeId)
  const stack = stackNear(point, active.nodeId)

  // A box wholly inside something beneath that stack goes in there — a
  // cell is a container in its own right once you are properly inside it.
  const nested = contained && stack && isBeneath(contained, stack.id) ? contained : null
  const settled = nested ?? stack ?? contained ?? null

  const targetId = settled?.id ?? null
  dropTargetNode.value = targetId ? nodeElement(targetId) : null
  dropTargetId.value = targetId
  dropRect.value = isViewport(targetId) ? null : measureRect(targetId)

  const parentRect = settled ? measureRect(settled.id) : null
  if (!settled || settled.layout === 'none' || !parentRect) {
    insertionStyle.value = null
    dropIntent.value = null
    return
  }

  // Measured once and shared — see `siblingBoxes`.
  const siblings = siblingBoxes(settled, active.nodeId).map((box) => toLocal(box, workspace.value))
  // The pointer rebased into the space the borders are measured in — a
  // zero-sized box, since `toLocal` speaks in rects.
  const local = toLocal({ left: point.x, top: point.y, width: 0, height: 0 }, workspace.value)
  const boundary = boundaryAt(
    boundariesOf(settled, parentRect, siblings, layoutIsHorizontal(settled, siblings)),
    { x: local.left, y: local.top },
  )

  // No border under the pointer — the middle of a cell, say. There is
  // nothing to insert against, so the drop falls to the page.
  if (!boundary) {
    insertionStyle.value = null
    dropIntent.value = null
    return
  }

  dropIntent.value = boundary.intent
  insertionStyle.value = insertionLine(boundary)
}

/** Clears everything a move gesture puts on screen. */
function clearMoveFeedback() {
  endDrag()
  dragOriginClient = null
  dragOriginRect.value = null
  insertionStyle.value = null
  dropIntent.value = null
  dropTargetId.value = null
  dropTargetNode.value = null
  dropRect.value = null
}

/**
 * The offsets a node should carry once `parent` has taken it in.
 *
 * A parent that lays its children out places them itself, so the offsets
 * are inert and are dropped rather than left behind to reappear the day
 * the layout is switched off. Otherwise they are rebased onto the new
 * parent, which is the whole job: they were measured against the old one
 * and would otherwise move the node the moment it changed hands.
 */
function placementIn(parent: CanvasNode, node: CanvasNode, local: Rect): NodeGeometry {
  const cleared: NodeGeometry = {
    left: undefined,
    top: undefined,
    right: undefined,
    bottom: undefined,
    pinLeft: false,
    pinRight: false,
    pinTop: false,
    pinBottom: false,
  }

  // `position: absolute` is the node's own claim and survives the move,
  // so such a node still needs real offsets even in a flex parent.
  const laidOut = node.position !== 'absolute' && parent.layout !== 'none'
  if (laidOut) return cleared

  return { ...cleared, left: local.left, top: local.top, pinLeft: true, pinTop: true }
}

/**
 * States the size a frame currently has, on any axis it was only getting
 * by grant of a parent that laid it out.
 *
 * `fill` means "share what my siblings leave"; carried somewhere nothing
 * grants it, the box collapses to nothing. The same freeze the inspector
 * performs when a frame leaves the flow.
 */
function freezeFilledAxes(node: CanvasNode, local: Rect) {
  for (const axis of ['width', 'height'] as const) {
    const mode = axis === 'width' ? node.widthMode : node.heightMode
    if (mode !== 'fill') continue
    // Mode first: switching it clears the number for the mode it left, so
    // a size written before this would be undone by it.
    updateSizeMode(node.id, axis, 'fixed')
    updateGeometry(node.id, { [axis]: Math.round(local[axis]) })
  }
}

/**
 * Puts a new stack where `target` stood, holding `target` and the dragged
 * frame.
 *
 * What a cross-axis drop means: a row cannot place a child below itself,
 * so honouring "below this row" takes a frame the row can live inside.
 * Built from the existing store operations rather than a new one —
 * `moveNode` already does the three-field reparent and takes an index.
 *
 * The new stack is `fit` on both axes rather than sized to the boxes it
 * is given: it hugs whatever the layout produces, so it stays right when
 * either child later changes, where a stated size would quietly stop
 * matching.
 */
function wrapInStack(target: CanvasNode, dragged: CanvasNode, intent: DropIntent & { kind: 'wrap' }) {
  const parentId = target.parentId
  if (!parentId) return

  const parent = getNode(parentId)
  if (!parent) return

  const slot = parent.childrenIds.indexOf(target.id)
  const draggedRectLocal = measureNodeRect(dragged.id)
  const targetRectLocal = measureNodeRect(target.id)

  const stack = addNode(
    'div',
    {
      layout: 'flex',
      // `alignItems`, because the frame was dropped across the new
      // stack's main axis: which third of the border it landed on is the
      // only thing that could have said where along that edge it goes.
      styles: {
        flexDirection: intent.direction,
        gap: STACK_GAP,
        alignItems: intent.align,
      },
      widthMode: 'fit',
      heightMode: 'fit',
      // Where the target stood, so the new stack lands in its place
      // rather than at the parent's origin.
      left: target.left,
      top: target.top,
      pinLeft: true,
      pinTop: true,
    },
    parentId,
  )

  // Into the slot the target occupied, so the page's own order is kept.
  if (slot !== -1) moveNode(stack.id, parentId, slot)

  moveNode(target.id, stack.id, 0)
  moveNode(dragged.id, stack.id, intent.before ? 0 : 1)

  // Both are placed by the new stack now, so their own offsets are inert
  // — and any `fill` they had was granted by a parent they have left.
  for (const [node, local] of [
    [target, targetRectLocal],
    [dragged, draggedRectLocal],
  ] as const) {
    if (local) freezeFilledAxes(node, local)
    updateGeometry(node.id, placementIn(stack, node, local ?? { left: 0, top: 0, width: 0, height: 0 }))
  }
}

/**
 * Settles a finished move: which frame the node now belongs to, and where
 * among its children it sits.
 *
 * The receiving frame is the innermost one wholly containing the dragged
 * box — the same rule drawing uses, and the same one
 * `updateMoveFeedback` has been highlighting by throughout the gesture.
 *
 * Nesting and reordering both fall out of it rather than needing separate
 * gestures: a frame dropped inside a cell is contained by that cell and
 * goes into it, while one dragged along a row is inside the row but
 * inside none of its cells, so the row takes it and the index below
 * decides where in the order it lands.
 */
function finishTransform(event: PointerEvent) {
  const active = transform
  transform = null

  // Only for rebasing the node's own offsets onto its new parent below —
  // the drop target itself was settled while the drag was still live.
  const rect = draggedRect(event.clientX - (active?.origin.x ?? 0), event.clientY - (active?.origin.y ?? 0))

  // Whatever the highlight has been pointing at, read before the feedback
  // is torn down. Deliberately not re-resolved from this event: drawing
  // reads the same refs at pointerup for the same reason, and resolving
  // twice is how the frame the chrome promised and the frame that
  // actually takes it drift apart.
  //
  // Released clear of the page entirely: it still belongs to something,
  // and the page is the only thing left.
  const targetElement = dropTargetNode.value ?? nodeElement(VIEWPORT_ID)
  const settledIntent = dropIntent.value
  clearMoveFeedback()

  if (!active?.moved || active.edges.length > 0) return

  const node = getNode(active.nodeId)
  if (!node?.parentId || !rect) return

  const point = { x: event.clientX, y: event.clientY }

  const targetId = targetElement?.dataset.nodeId ?? VIEWPORT_ID
  const target = getNode(targetId)
  if (!target || !targetElement) return

  // Whatever the line was promising. A cross-axis drop asks for
  // something the target cannot do on its own — see `wrapInStack` — and
  // is skipped only when the target's own parent already runs that way,
  // since it can simply take the frame and a wrapper would deepen the
  // tree for nothing.
  const intent = settledIntent
  if (intent?.kind === 'wrap' && intent.targetId === targetId) {
    const grandparent = getNode(target.parentId)
    const alreadyStacked =
      grandparent?.layout === 'flex' &&
      (grandparent.styles.flexDirection ?? 'row') === intent.direction

    if (!alreadyStacked) {
      wrapInStack(target, node, intent)
      return
    }
  }

  // No border was under the pointer, so nothing was offered and nothing
  // is taken: the frame stays where it was dropped, on the page.
  if (!intent && target.layout !== 'none') return

  const index =
    intent?.kind === 'insert'
      ? intent.index
      : insertionIndex(siblingBoxes(target, node.id), point)

  if (targetId === node.parentId) {
    // Same parent, so this is a reorder — and only a frame the parent
    // actually places has an order to change.
    if (active.absolute) return
    // Its own index doubles as the no-op case: reinserting a node at the
    // position it already occupies would churn two arrays for nothing.
    const current = target.childrenIds.indexOf(node.id)
    if (index !== current) moveNode(node.id, targetId, index)
    return
  }

  // Measured before the move, while the old offsets still hold.
  const local = toCanvasLocal(rect, targetElement)
  const laidOut = node.position !== 'absolute' && target.layout !== 'none'

  moveNode(node.id, targetId, index)

  if (!laidOut) freezeFilledAxes(node, local)
  updateGeometry(node.id, placementIn(target, node, local))
}

/** Abandons a gesture, putting back the pins it had already overwritten. */
function cancelTransform() {
  const active = transform
  transform = null
  clearMoveFeedback()
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
    const target = elementUnder(event)
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
  updateDropTarget()

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
  // The box has changed shape, so what encloses it may have changed too.
  updateDropTarget()
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
      The slot a dragged frame is leaving, so it stays visible behind the
      frame itself while that follows the pointer.
    -->
    <div v-if="dragOriginStyle" class="workspace__drag-origin" :style="dragOriginStyle" />

    <!--
      Where a dragged frame will be inserted among its new siblings. Only
      appears over a frame that lays its children out — see `insertionLine`.
    -->
    <div v-if="insertionStyle" class="workspace__insertion" :style="insertionStyle" />

    <!--
      What is being drawn, in canvas units. Outside the canvas layer on
      purpose — see `ghostLabelStyle` — so it neither scales nor moves
      with the zoom it is reporting a size at.
    -->
    <div v-if="ghostLabelStyle" class="workspace__ghost-label" :style="ghostLabelStyle">
      {{ ghostLabel }}
    </div>

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

/* A hairline and nothing else. Unfilled and undashed on purpose: this is
   a preview of the box's bounds, and either a tint or a dashed edge would
   be showing something the frame is not going to look like. */
.workspace__ghost {
  outline: 1px solid var(--color-accent);
  outline-offset: -1px;
  pointer-events: none;
}

/* Right-aligned with the box's own right edge, sitting just below it —
   `left` is that corner, and the translate hangs the pill back from it. */
.workspace__ghost-label {
  position: absolute;
  transform: translateX(-100%);
  padding: 0.125rem 0.375rem;
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
  white-space: nowrap;
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
  border-radius: 0.25rem;
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

/* A border and nothing more. No tint: it would paint over the frame's own
   children, so the frame being highlighted is the one place the colours
   stop telling the truth — and the border alone already says which frame
   is about to receive the element. */
.workspace__drop-target {
  position: absolute;
  outline: 1px solid var(--color-accent);
  outline-offset: -1px;
  pointer-events: none;
}

/* Faint on purpose: it marks a space rather than occupying one, and has
   to stay quieter than the frame that is actually being dragged. */
.workspace__drag-origin {
  position: absolute;
  background-color: color-mix(in srgb, var(--color-accent) 8%, transparent);
  pointer-events: none;
}

/* A hairline with a dot at each end, sized from whichever dimension the
   line spans — the other is left to the inline style. Both dots are drawn
   by pseudo-elements so the line stays one element to position. */
.workspace__insertion {
  position: absolute;
  z-index: 1;
  width: 2px;
  height: 2px;
  background-color: var(--color-accent);
  border-radius: 1px;
  pointer-events: none;
  transform: translate(-1px, -1px);
}

.workspace__insertion::before,
.workspace__insertion::after {
  content: '';
  position: absolute;
  width: 7px;
  height: 7px;
  background-color: var(--color-surface-raised);
  border: 2px solid var(--color-accent);
  border-radius: 50%;
  /* Centred on the line's own ends, whichever way it runs. */
  translate: -50% -50%;
}

.workspace__insertion::before {
  top: 0;
  left: 0;
}

.workspace__insertion::after {
  top: 100%;
  left: 100%;
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
