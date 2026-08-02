import { computed, ref } from 'vue'

import { frameLayout } from './useFrameTool'
import type { ElementType, NodeInit } from './useCanvasNodes'

export interface Tool {
  /**
   * The tool's own identity — deliberately *not* the element type it
   * creates. Several tools can emit the same tag with different seed
   * styles, which is exactly what a Frame set to `flex` versus `block`
   * is, so the two can no longer be the same field.
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
   * A function rather than a literal so a tool can carry a user-chosen
   * option — the Frame tool's display — while still being a static
   * registry entry.
   */
  seedInit: () => NodeInit
}

/**
 * The creation tools available in the toolbar.
 *
 * Adding a tool is one entry here: the toolbar renders from this array
 * and the keyboard handler resolves shortcuts against it, so neither
 * needs editing to pick up a new tool.
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
    seedInit: () => ({ layout: frameLayout.value }),
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
