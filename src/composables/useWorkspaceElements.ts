import { computed, ref } from 'vue'

/**
 * The HTML tags the builder can emit. Adding a type here is the only
 * change this file needs — the type union derives from it.
 *
 * This is the *tag*, not the layout: a flex frame and a block frame are
 * both `div`s that differ only in their `display` style. `type` earns its
 * keep once a tool emits a genuinely different tag — a `section`,
 * `button` or `img`.
 *
 * No longer 1:1 with `TOOLS`: several tools can create the same tag with
 * different seed styles, which is exactly what the Frame tool does.
 */
export const ELEMENT_TYPES = ['div'] as const

export type ElementType = (typeof ELEMENT_TYPES)[number]

/**
 * One element on the workspace.
 *
 * Note what is deliberately absent: there is no `x`, `y`, `width` or
 * `height` field. Elements live in normal document flow, so the flow
 * owns position, and everything the user can change — including size —
 * is CSS in `styles`. That keeps a single editing path: the inspector
 * writes CSS, and nothing else has a competing idea of where or how big
 * an element is.
 *
 * Keys are camelCase because that is what Vue's `:style` binding takes.
 * An empty-string value means "unset" and is filtered out before being
 * applied, so `styles` only ever carries what was explicitly set.
 */
export interface WorkspaceElement {
  id: string
  type: ElementType
  styles: Record<string, string>
  /**
   * Always an array, never optional, so push and render have one code
   * path and nothing has to null-check before descending.
   */
  children: WorkspaceElement[]
}

/** The document root — the workspace's own children. */
const elements = ref<WorkspaceElement[]>([])
const selectedId = ref<string | null>(null)

/**
 * Depth-first over the whole document, parents before children.
 *
 * Deletion will want a `{ node, parent, index }` variant of this, since
 * removing a node needs its parent. Extend here rather than growing a
 * second traversal alongside it.
 */
export function* walkElements(
  nodes: readonly WorkspaceElement[],
): Generator<WorkspaceElement> {
  for (const node of nodes) {
    yield node
    yield* walkElements(node.children)
  }
}

/** The element with this id, at any depth. */
export function findElement(
  id: string | null | undefined,
  nodes: readonly WorkspaceElement[] = elements.value,
): WorkspaceElement | null {
  if (!id) return null
  for (const node of walkElements(nodes)) {
    if (node.id === id) return node
  }
  return null
}

/**
 * The workspace document and its current selection.
 *
 * State is module-level for the same reason as `useTheme`'s preference:
 * there is one workspace, so every caller shares one source of truth
 * rather than each mounting its own copy.
 */
export function useWorkspaceElements() {
  const selectedElement = computed(() => findElement(selectedId.value))

  /**
   * Appends to the end of the parent's children, or to the root when no
   * parent is given — draw position is still not a placement.
   *
   * An unknown `parentId` falls back to the root rather than throwing,
   * matching `updateStyle`'s "ignore an id that isn't there" posture.
   */
  function addElement(
    type: ElementType,
    styles: Record<string, string> = {},
    parentId: string | null = null,
  ) {
    const element: WorkspaceElement = { id: crypto.randomUUID(), type, styles, children: [] }
    const parent = findElement(parentId)
    ;(parent ? parent.children : elements.value).push(element)
    return element
  }

  function select(id: string | null) {
    selectedId.value = id
  }

  function updateStyle(id: string, key: string, value: string) {
    const match = findElement(id)
    if (match) match.styles[key] = value
  }

  return { elements, selectedId, selectedElement, addElement, select, updateStyle }
}
