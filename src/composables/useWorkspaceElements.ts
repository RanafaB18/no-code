import { computed, ref } from 'vue'

/**
 * The element types the builder can create. Adding a type here is the
 * only change this file needs — the type union derives from it.
 *
 * Must stay in sync with the `TOOLS` registry in ./useTools.ts.
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
}

const elements = ref<WorkspaceElement[]>([])
const selectedId = ref<string | null>(null)

/**
 * The workspace document and its current selection.
 *
 * State is module-level for the same reason as `useTheme`'s preference:
 * there is one workspace, so every caller shares one source of truth
 * rather than each mounting its own copy.
 */
export function useWorkspaceElements() {
  const selectedElement = computed(
    () => elements.value.find((element) => element.id === selectedId.value) ?? null,
  )

  /** Appends to the end of the flow — draw position is not a placement. */
  function addElement(type: ElementType, styles: Record<string, string> = {}) {
    const element: WorkspaceElement = { id: crypto.randomUUID(), type, styles }
    elements.value.push(element)
    return element
  }

  function select(id: string | null) {
    selectedId.value = id
  }

  function updateStyle(id: string, key: string, value: string) {
    const match = elements.value.find((element) => element.id === id)
    if (match) match.styles[key] = value
  }

  return { elements, selectedId, selectedElement, addElement, select, updateStyle }
}
