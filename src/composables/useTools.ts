import { computed, ref } from 'vue'

import type { ElementType, NodeInit } from './useCanvasNodes'

export interface Tool {
  /**
   * The tool's own identity — deliberately *not* the element type it
   * creates. Several tools emit the same tag with different seed fields,
   * which is exactly what Frame, Flex and Grid are, so the two cannot be
   * the same field.
   */
  id: string
  /** Toolbar button text. */
  label: string
  /**
   * Single key that arms/disarms this tool, matched case-insensitively.
   * Tools are numbered from '1' in toolbar order; letters are allowed
   * for tools that later earn a mnemonic of their own.
   */
  shortcut: string
  /** The HTML tag this tool creates. */
  creates: ElementType
  /**
   * The node fields and styles stamped onto whatever this tool creates.
   *
   * A function rather than a literal so that a tool handing out object
   * fields cannot hand the same object to two nodes. Each entry's seed is
   * fixed — a tool *is* one kind of thing to draw, so there is nothing
   * left here for a separate mode selector to vary.
   */
  seedInit: () => NodeInit
}

/**
 * The creation tools available to draw with.
 *
 * Adding a tool is one entry here: the tool menu renders from this array
 * and the keyboard handler resolves shortcuts against it, so neither
 * needs editing to pick up a new tool.
 *
 * All three draw the same tag and differ only in the layout they stamp —
 * which is the distinction that matters to someone drawing, since it
 * decides whether the box they get places its children where they put
 * them or arranges them itself.
 *
 * `as const satisfies` rather than a `: readonly Tool[]` annotation:
 * the annotation would widen `id` to `string` and lose `ToolId` as a
 * real union, taking `arm`/`toggle`'s type safety with it.
 */
export const TOOLS = [
  {
    id: 'frame',
    label: 'Frame',
    shortcut: '1',
    creates: 'div',
    // `none` is a frame that imposes no layout, so children sit at the
    // coordinates they were drawn at — what makes drawing WYSIWYG.
    seedInit: (): NodeInit => ({ layout: 'none' }),
  },
  {
    id: 'flex',
    label: 'Flex',
    shortcut: '2',
    creates: 'div',
    seedInit: (): NodeInit => ({ layout: 'flex' }),
  },
  {
    id: 'grid',
    label: 'Grid',
    shortcut: '3',
    creates: 'div',
    seedInit: (): NodeInit => ({ layout: 'grid' }),
  },
] as const satisfies readonly Tool[]

/**
 * A tool as it appears in the registry, with `id` still narrowed to its
 * literal. `Tool` itself widens `id` to `string` for authoring, so
 * components handed a registry entry should take this instead — it is
 * what keeps `arm`/`toggle` callable without a cast.
 */
export type RegisteredTool = (typeof TOOLS)[number]

export type ToolId = RegisteredTool['id']

/**
 * The id of the armed creation tool, or `null` when none is armed.
 *
 * `activeToolId` is what distinguishes the builder's two modes:
 * a tool is armed, so dragging draws a new element; or it is `null`,
 * which is select mode, where clicking picks an existing element. Only
 * one tool can be armed at a time — arming a second switches straight
 * to it rather than requiring a disarm first.
 *
 * Module-level for the same reason as `useTheme`'s preference: the armed
 * tool is a single global that the toolbar, the workspace and the
 * keyboard handler all have to agree on.
 */
const activeToolId = ref<ToolId | null>(null)

/** The armed-tool state, plus the actions that change it. */
export function useTools() {
  const activeTool = computed(() => TOOLS.find((tool) => tool.id === activeToolId.value) ?? null)

  function arm(id: ToolId) {
    activeToolId.value = id
  }

  function disarm() {
    activeToolId.value = null
  }

  /**
   * Backs both the toolbar button and the keyboard shortcut, so the two
   * entry points can't develop different behaviour: pressing the key
   * twice disarms exactly like clicking the button twice.
   */
  function toggle(id: ToolId) {
    activeToolId.value = activeToolId.value === id ? null : id
  }

  return { activeToolId, activeTool, arm, disarm, toggle }
}
