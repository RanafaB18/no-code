import { onMounted, onUnmounted } from 'vue'

import { TOOLS, useTools } from './useTools'

/**
 * Marks a subtree as chrome: a keystroke inside it belongs to that
 * control, not to the canvas.
 *
 * Replaces an `input, textarea, select` tag list, which was wrong in both
 * directions. It missed a focused `<button>` — every panel is full of
 * them — so Backspace on a toolbar button would have deleted the
 * selection. And it would have had to grow with every new kind of control
 * the inspector ever gains.
 *
 * Asking "is this inside chrome?" instead is a question that does not get
 * longer. Anything floating above the canvas carries the attribute; the
 * canvas itself does not, so shortcuts work there and nowhere else.
 */
export const SHORTCUT_BOUNDARY = 'data-shortcut-boundary'

export interface CanvasShortcutHandlers {
  /** Cancel: disarm the tool and abandon any gesture in flight. */
  onEscape: () => void
  /** Remove the current selection. */
  onDelete: () => void
}

/**
 * The builder's keyboard map: digits arm tools, Escape cancels, Delete
 * removes.
 *
 * Unlike `useTheme`, which registers a `watchEffect` meant to live for
 * the whole app, this attaches a listener to `window` and so must be
 * called from a component's `setup()` — the `onMounted`/`onUnmounted`
 * pair is what stops the listener outliving its component.
 *
 * Escape and Delete are handed back to the caller rather than acted on
 * here, because both need workspace state this composable has no business
 * knowing: what is half-drawn, and what is selected.
 */
export function useCanvasShortcuts(handlers: CanvasShortcutHandlers) {
  const { toggle } = useTools()

  function handleKeydown(event: KeyboardEvent) {
    // Leave browser and OS combinations alone — '1' arms a tool here,
    // but Ctrl+1 still belongs to the browser for switching tabs.
    if (event.ctrlKey || event.metaKey || event.altKey) return

    const target = event.target
    if (target instanceof Element && target.closest(`[${SHORTCUT_BOUNDARY}]`)) return

    if (event.key === 'Escape') {
      handlers.onEscape()
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Backspace still navigates back in some browsers when no field has
      // focus, which is exactly the situation this fires in.
      event.preventDefault()
      handlers.onDelete()
      return
    }

    const tool = TOOLS.find((candidate) => candidate.shortcut === event.key.toLowerCase())
    if (tool) toggle(tool.id)
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
}
