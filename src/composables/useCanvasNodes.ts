import { computed, ref } from 'vue'

/**
 * The HTML tags the builder can emit. Adding a type here is the only
 * change this file needs — the union derives from it.
 *
 * This is the *tag*, not the layout: a flex frame and a plain frame are
 * both `div`s differing only in how they arrange children.
 */
export const ELEMENT_TYPES = ['div'] as const

export type ElementType = (typeof ELEMENT_TYPES)[number]

export type NodeId = string

/** How a node arranges its **children**. */
export type NodeLayout = 'none' | 'flex' | 'grid'

/** How a node positions **itself**. `auto` defers to the parent's layout. */
export type NodePosition = 'auto' | 'absolute'

/**
 * How an axis gets its size.
 *
 * The stored number means something different under each, which is why
 * the mode is a field rather than a unit suffix on a string:
 *
 *   fixed     the number is px
 *   relative  the number is a percentage of the containing block's
 *             **padding** box — so a parent's padding changes what 50%
 *             means, as well as where the child starts
 *   fill      no number; takes the space its siblings leave
 *   fit       no number; shrinks to its contents
 *
 * `fill` is only expressible for a node its parent actually lays out —
 * it becomes `flex-grow` along the main axis and `stretch` across it.
 * An absolutely positioned node fills by pinning both edges instead,
 * which is the constraint widget's job, not this one's.
 */
export type SizeMode = 'fixed' | 'relative' | 'fill' | 'fit'

export const DEFAULT_SIZE_MODE: SizeMode = 'fixed'

/** The two axes a size mode applies to. */
export type SizeAxis = 'width' | 'height'

/**
 * Geometry, in parent-local px.
 *
 * Optional edge pins per axis rather than x/y/w/h, because that is what
 * makes an absolute layout responsive — and it maps straight to CSS:
 *
 *   left + width      pinned left, fixed size
 *   right + width     sticks to the right edge as the parent widens
 *   left + right      width DERIVED — the element stretches
 *
 * Drawing only ever writes `left + top + width + height`. The pin widget
 * that expresses the other combinations is a later change, and needs no
 * remodelling.
 */
export interface NodeGeometry {
  left?: number
  right?: number
  width?: number
  top?: number
  bottom?: number
  height?: number
}

/**
 * One node on the canvas.
 *
 * Stored in a flat map keyed by id — never as nested child objects.
 * Relationships are ids only: `parentId` up, `childrenIds` down.
 */
export interface CanvasNode extends NodeGeometry {
  id: NodeId
  type: ElementType

  parentId: NodeId | null
  /** Ids, never nested objects. Order here is render order. */
  childrenIds: NodeId[]

  layout: NodeLayout
  position: NodePosition

  /**
   * How `width` and `height` above are to be read. Separate fields rather
   * than one, because the two axes are independent: a card is commonly
   * relative across and fit-content down.
   */
  widthMode: SizeMode
  heightMode: SizeMode

  /**
   * CSS only — colours, borders, padding, gap, alignment. **Never
   * geometry**, which lives in the fields above so hit-testing and
   * visibility maths never have to parse strings.
   *
   * camelCase keys because that is what Vue's `:style` takes; an empty
   * string means "unset" and is filtered out before being applied.
   */
  styles: Record<string, string>
}

/** The one node every document has, and the origin of all coordinates. */
export const VIEWPORT_ID = 'viewport'

/** Fixed canvas size — the "page" being designed, not the window. */
export const VIEWPORT_WIDTH = 1440
export const VIEWPORT_HEIGHT = 1024

export function isViewport(id: NodeId | null | undefined): boolean {
  return id === VIEWPORT_ID
}

/**
 * A fresh viewport.
 *
 * Built per call rather than shared, so a reset can never hand back an
 * object a previous document already mutated.
 *
 * It is the coordinate origin, so it is never `absolute` — there is
 * nothing above it to position against — and has no parent to impose a
 * layout on it.
 */
export function createViewport(): CanvasNode {
  return {
    id: VIEWPORT_ID,
    type: 'div',
    parentId: null,
    childrenIds: [],
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    widthMode: DEFAULT_SIZE_MODE,
    heightMode: DEFAULT_SIZE_MODE,
    layout: 'none',
    position: 'auto',
    styles: {},
  }
}

/**
 * The store.
 *
 * A `ref` rather than `reactive` so `resetDocument` can replace the whole
 * map in one assignment. A ref's object value is still deeply reactive,
 * and reading `nodes.value[id]` depends on *that key alone* — mutating a
 * sibling never invalidates a renderer looking at this one.
 */
const nodes = ref<Record<NodeId, CanvasNode>>({ [VIEWPORT_ID]: createViewport() })

const selectedId = ref<NodeId | null>(null)

/** O(1). Returns null rather than throwing for an unknown id. */
export function getNode(id: NodeId | null | undefined): CanvasNode | null {
  if (!id) return null
  return nodes.value[id] ?? null
}

/**
 * Whether a node positions itself, or is placed by its parent's layout.
 *
 * The single rule every consumer asks — drawing, dragging, the selection
 * overlay and export all branch on this rather than re-deriving it. A
 * node is absolute when explicitly pinned, or when its parent imposes no
 * layout to place it.
 *
 * Never `static`: a static frame is invisible to the containing-block
 * search, so any absolute child of it would escape and position against
 * a distant ancestor instead.
 */
export function resolvedPosition(node: CanvasNode): 'absolute' | 'relative' {
  if (isViewport(node.id)) return 'relative'
  if (node.position === 'absolute') return 'absolute'
  return getNode(node.parentId)?.layout === 'none' ? 'absolute' : 'relative'
}

export interface NodeInit extends NodeGeometry {
  layout?: NodeLayout
  position?: NodePosition
  widthMode?: SizeMode
  heightMode?: SizeMode
  styles?: Record<string, string>
}

/**
 * Appends a node to a parent's children, defaulting to the viewport.
 *
 * An unknown `parentId` falls back to the viewport rather than throwing,
 * keeping the "ignore an id that isn't there" posture `updateStyle` has.
 * There is no "no parent" case: every node descends from the viewport.
 */
export function addNode(
  type: ElementType,
  init: NodeInit = {},
  parentId: NodeId | null = null,
): CanvasNode {
  const {
    layout = 'none',
    position = 'auto',
    widthMode = DEFAULT_SIZE_MODE,
    heightMode = DEFAULT_SIZE_MODE,
    styles = {},
    ...geometry
  } = init
  const parent = getNode(parentId) ?? getNode(VIEWPORT_ID)!

  const node: CanvasNode = {
    id: crypto.randomUUID(),
    type,
    parentId: parent.id,
    childrenIds: [],
    layout,
    position,
    widthMode,
    heightMode,
    styles,
    ...geometry,
  }

  nodes.value[node.id] = node
  parent.childrenIds.push(node.id)
  return node
}

/**
 * Removes a node and its whole subtree.
 *
 * O(subtree), not O(1): descendants must be evicted from the map too, or
 * they leak as orphans no longer reachable from any parent. The viewport
 * cannot be removed — it is the document.
 */
export function removeNode(id: NodeId): void {
  const node = getNode(id)
  if (!node || isViewport(id)) return

  const parent = getNode(node.parentId)
  if (parent) {
    const index = parent.childrenIds.indexOf(id)
    if (index !== -1) parent.childrenIds.splice(index, 1)
  }

  // Collected before deleting, not during: `walkNodes` reads the map as it
  // goes, so evicting mid-walk would truncate it and leave the deeper
  // descendants orphaned in the store.
  const doomed = Array.from(walkNodes(id), (descendant) => descendant.id)
  for (const doomedId of doomed) {
    delete nodes.value[doomedId]
  }

  if (selectedId.value && !getNode(selectedId.value)) {
    // Land on the parent rather than nothing, so you are never stranded
    // next to something you can no longer click — except when that parent
    // is the viewport, which is the document rather than an element and is
    // deliberately not selectable by pointer. Selecting it here would be a
    // back door into editing the canvas that nothing else offers.
    selectedId.value = parent && !isViewport(parent.id) ? parent.id : null
  }
}

/**
 * Reparents a node — the three-field write the flat map exists for: the
 * moved node's `parentId`, the old parent's `childrenIds`, the new
 * parent's. No subtree is touched.
 */
export function moveNode(id: NodeId, newParentId: NodeId, index?: number): void {
  const node = getNode(id)
  const newParent = getNode(newParentId)
  if (!node || !newParent || isViewport(id)) return

  // A node cannot become its own descendant.
  for (const descendant of walkNodes(id)) {
    if (descendant.id === newParentId) return
  }

  const oldParent = getNode(node.parentId)
  if (oldParent) {
    const at = oldParent.childrenIds.indexOf(id)
    if (at !== -1) oldParent.childrenIds.splice(at, 1)
  }

  node.parentId = newParentId
  newParent.childrenIds.splice(index ?? newParent.childrenIds.length, 0, id)
}

/** O(1) — no traversal. */
export function updateStyle(id: NodeId, key: string, value: string): void {
  const node = getNode(id)
  if (node) node.styles[key] = value
}

/** O(1). Undefined values clear a pin rather than being written. */
export function updateGeometry(id: NodeId, patch: NodeGeometry): void {
  const node = getNode(id)
  if (!node) return

  for (const [key, value] of Object.entries(patch) as [keyof NodeGeometry, number | undefined][]) {
    if (value === undefined) delete node[key]
    else node[key] = value
  }
}

/**
 * O(1). Switching modes carries the stored number across only where it
 * still means something:
 *
 *   -> relative  seeded to 100, so the node fills its parent rather than
 *                reappearing at 200% of it because 200px was in the field
 *   -> fill/fit  cleared, since neither reads a number and a stale one
 *                would spring back the moment you returned to fixed
 *   -> fixed     kept, so a percentage becomes that many px — visibly
 *                wrong if unwanted, and one keystroke to correct
 */
export function updateSizeMode(id: NodeId, axis: SizeAxis, mode: SizeMode): void {
  const node = getNode(id)
  if (!node) return

  node[axis === 'width' ? 'widthMode' : 'heightMode'] = mode
  if (mode === 'relative') node[axis] = 100
  else if (mode === 'fill' || mode === 'fit') delete node[axis]
}

/** True when the axis reads its stored number at all. */
export function usesSizeValue(mode: SizeMode): boolean {
  return mode === 'fixed' || mode === 'relative'
}

/** O(1). */
export function updateLayout(id: NodeId, layout: NodeLayout): void {
  const node = getNode(id)
  if (node) node.layout = layout
}

/** O(1). The viewport's own positioning is not the user's to change. */
export function updatePosition(id: NodeId, position: NodePosition): void {
  const node = getNode(id)
  if (node && !isViewport(id)) node.position = position
}

/**
 * Depth-first from `id`, parents before children, `id` included.
 *
 * Traverses `childrenIds` rather than querying the DOM — the tree is a
 * property of the store, not of what happens to be rendered.
 */
export function* walkNodes(id: NodeId): Generator<CanvasNode> {
  const node = getNode(id)
  if (!node) return

  yield node
  for (const childId of node.childrenIds) {
    yield* walkNodes(childId)
  }
}

/** Replaces the document with an empty viewport. */
export function resetDocument(): void {
  nodes.value = { [VIEWPORT_ID]: createViewport() }
  selectedId.value = null
}

/**
 * The canvas document and its selection.
 *
 * Module-level for the same reason as `useTheme`'s preference: there is
 * one document, so every caller shares one source of truth.
 */
export function useCanvasNodes() {
  const selectedNode = computed(() => getNode(selectedId.value))
  const viewport = computed(() => getNode(VIEWPORT_ID)!)

  function selectNode(id: NodeId | null) {
    selectedId.value = id
  }

  return {
    nodes,
    viewport,
    selectedId,
    selectedNode,
    getNode,
    addNode,
    removeNode,
    moveNode,
    selectNode,
    updateStyle,
    updateGeometry,
    updateSizeMode,
    updateLayout,
    updatePosition,
    resetDocument,
  }
}
