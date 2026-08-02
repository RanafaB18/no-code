import { computed, ref } from 'vue'

import type { ElementType } from './useWorkspaceElements'

export interface Tool {
  /** The element type this tool creates. */
  id: ElementType
  /** Toolbar button text. */
  label: string
  /**
   * Single key that arms/disarms this tool, matched case-insensitively.
   * Tools are numbered from '1' in toolbar order; letters are allowed
   * for tools that later earn a mnemonic of their own.
   */
  shortcut: string
}

/**
 * The creation tools available in the toolbar.
 *
 * Adding a tool is one entry here: the toolbar renders from this array
 * and the keyboard handler resolves shortcuts against it, so neither
 * needs editing to pick up a new tool.
 */
export const TOOLS: readonly Tool[] = [{ id: 'div', label: 'Div', shortcut: '1' }]

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
const activeToolId = ref<ElementType | null>(null)

/** The armed-tool state, plus the actions that change it. */
export function useTools() {
  const activeTool = computed(() => TOOLS.find((tool) => tool.id === activeToolId.value) ?? null)

  function arm(id: ElementType) {
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
  function toggle(id: ElementType) {
    activeToolId.value = activeToolId.value === id ? null : id
  }

  return { activeToolId, activeTool, arm, disarm, toggle }
}
