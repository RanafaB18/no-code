import { onMounted, onUnmounted } from 'vue'

import { TOOLS, useTools } from './useTools'

/**
 * Elements that handle typing themselves, so a keypress inside one
 * belongs to them and is not a shortcut. `select` is included alongside
 * the text fields because typing in a dropdown jumps between options.
 *
 * Matched with a selector rather than comparing `tagName`: `tagName` is
 * only uppercased for HTML elements in an HTML document (it preserves
 * case in XHTML), whereas CSS type selectors match HTML element names
 * case-insensitively regardless.
 */
const KEY_CONSUMING_SELECTOR = 'input, textarea, select'

/**
 * Keyboard shortcuts for arming tools, plus Escape to cancel.
 *
 * Unlike `useTheme`, which registers a `watchEffect` meant to live for
 * the whole app, this attaches a listener to `window` and so must be
 * called from a component's `setup()` — the `onMounted`/`onUnmounted`
 * pair is what stops the listener outliving its component.
 *
 * Escape is handed back to the caller rather than disarming here,
 * because cancelling has two halves that only the workspace can do
 * together: disarm the tool *and* discard any half-drawn element.
 */
export function useToolShortcuts(onEscape: () => void) {
  const { toggle } = useTools()

  function handleKeydown(event: KeyboardEvent) {
    // Leave browser and OS combinations alone — '1' arms a tool here,
    // but Ctrl+1 still belongs to the browser for switching tabs.
    if (event.ctrlKey || event.metaKey || event.altKey) return

    // Load-bearing now that shortcuts are digits: the inspector's length
    // fields are exactly where someone types '1' as part of '12px', and
    // that keystroke must reach the field rather than arm a tool.
    const target = event.target
    if (target instanceof HTMLElement && target.matches(KEY_CONSUMING_SELECTOR)) return

    if (event.key === 'Escape') {
      onEscape()
      return
    }

    const tool = TOOLS.find((candidate) => candidate.shortcut === event.key.toLowerCase())
    if (tool) toggle(tool.id)
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
}
