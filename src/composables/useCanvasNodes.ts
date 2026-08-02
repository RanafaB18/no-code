import { computed, ref } from 'vue'

/**
 * The HTML tags the builder can emit. Adding a type here is the only
 * change this file needs — the union derives from it.
 *
 * This is the *tag*, not the layout: a flex frame and a plain frame are
 * both `div`s differing only in how they arrange children. `type` earns
 * its keep once a tool emits a genuinely different tag.
 */
export const ELEMENT_TYPES = ['div'] as const

export type ElementType = (typeof ELEMENT_TYPES)[number]

export type NodeId = string

/**
 * One node on the canvas.
 *
 * Stored in a flat map keyed by id — never as nested child objects.
 * Relationships are ids only: `parentId` up, `childrenIds` down. That is
 * what makes lookup and update O(1), and reparenting three field writes
 * (the moved node's `parentId`, the old parent's `childrenIds`, the new
 * parent's) rather than a splice out of one array and a push into another.
 */
export interface CanvasNode {
  id: NodeId
  type: ElementType

  parentId: NodeId | null
  /** Ids, never nested objects. Order here is render order. */
  childrenIds: NodeId[]

  /**
   * CSS only. camelCase keys because that is what Vue's `:style` takes;
   * an empty-string value means "unset" and is filtered out before it is
   * applied, so this only ever carries what was explicitly set.
   *
   * Geometry moves out of here into first-class fields in phase 2.
   */
  styles: Record<string, string>
}

/**
 * The store.
 *
 * A `ref` rather than `reactive` so `resetDocument` can replace the whole
 * map in one assignment. A ref's object value is still deeply reactive,
 * and reading `nodes.value[id]` depends on *that key alone* — mutating a
 * sibling never invalidates a renderer looking at this one.
 */
const nodes = ref<Record<NodeId, CanvasNode>>({})

/**
 * Top-level node ids.
 *
 * Preserves today's multiple-roots behaviour. Phase 2 collapses this to a
 * single viewport root; doing it here would be a behaviour change, and
 * this migration is deliberately behaviour-neutral.
 */
const rootIds = ref<NodeId[]>([])

const selectedId = ref<NodeId | null>(null)

/** O(1). Returns null rather than throwing for an unknown id. */
export function getNode(id: NodeId | null | undefined): CanvasNode | null {
  if (!id) return null
  return nodes.value[id] ?? null
}

/** The ids a node's children occupy, or the roots when given nothing. */
function siblingIdsFor(parentId: NodeId | null): NodeId[] {
  const parent = getNode(parentId)
  return parent ? parent.childrenIds : rootIds.value
}

/**
 * Appends a node to a parent's children, or to the roots when no parent is
 * given.
 *
 * An unknown `parentId` falls back to a root rather than throwing, keeping
 * the "ignore an id that isn't there" posture `updateStyle` already had.
 */
export function addNode(
  type: ElementType,
  styles: Record<string, string> = {},
  parentId: NodeId | null = null,
): CanvasNode {
  const parent = getNode(parentId)
  const node: CanvasNode = {
    id: crypto.randomUUID(),
    type,
    parentId: parent?.id ?? null,
    childrenIds: [],
    styles,
  }

  nodes.value[node.id] = node
  siblingIdsFor(parent?.id ?? null).push(node.id)
  return node
}

/** O(1) — no traversal. */
export function updateStyle(id: NodeId, key: string, value: string): void {
  const node = getNode(id)
  if (node) node.styles[key] = value
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

/** Depth-first across every root, in root order. */
export function* walkRoots(): Generator<CanvasNode> {
  for (const id of rootIds.value) {
    yield* walkNodes(id)
  }
}

/** Empties the document and clears the selection. */
export function resetDocument(): void {
  nodes.value = {}
  rootIds.value = []
  selectedId.value = null
}

/**
 * The canvas document and its selection.
 *
 * Module-level for the same reason as `useTheme`'s preference: there is one
 * document, so every caller shares one source of truth rather than each
 * mounting its own copy.
 */
export function useCanvasNodes() {
  const selectedNode = computed(() => getNode(selectedId.value))

  function selectNode(id: NodeId | null) {
    selectedId.value = id
  }

  return {
    nodes,
    rootIds,
    selectedId,
    selectedNode,
    getNode,
    addNode,
    selectNode,
    updateStyle,
    resetDocument,
  }
}
