<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { onClickOutside } from '@vueuse/core'

import { TOOLS, useTools, type ToolId } from '@/composables/useTools'
import { workspaceElement } from '@/composables/useWorkspaceRect'

/**
 * The insert menu: one trigger, and a list of everything that can be
 * drawn.
 *
 * The trigger is deliberately inert as a tool — it always opens the menu
 * and never arms anything itself. Arming is choosing an item, so there is
 * one way to pick a tool with the pointer rather than a button whose
 * meaning depends on what was picked last.
 *
 * Items are `menuitemradio` rather than the native radios `ThemeToggle`
 * uses for its segmented control, which is the opposite call to the one
 * made there and for a specific reason: native radios *select as you
 * arrow onto them*. In a menu that closes when something is chosen, the
 * first ArrowDown would both arm a tool and shut the menu. A menu of
 * actions has to move focus without acting, so the roving focus below is
 * hand-rolled and `aria-checked` carries which tool is armed.
 */
const { activeToolId, toggle } = useTools()

const open = ref(false)

const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const list = useTemplateRef<HTMLElement>('list')

const armed = computed(() => TOOLS.find((tool) => tool.id === activeToolId.value) ?? null)

/**
 * The trigger says what is armed, even though it never arms anything.
 *
 * Digit shortcuts arm without ever opening this, so without it the app
 * can sit in draw mode with no chrome saying so — the crosshair cursor
 * over the canvas would be the only clue.
 */
const triggerLabel = computed(() =>
  armed.value ? `Insert — ${armed.value.label} armed` : 'Insert',
)

async function openMenu() {
  open.value = true
  await nextTick()
  itemAt(0)?.focus()
}

function close({ restoreFocus = true } = {}) {
  if (!open.value) return
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

function items() {
  return [...(list.value?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])]
}

function itemAt(index: number) {
  const all = items()
  // Wraps at both ends, which is what the menu pattern specifies.
  return all[(index + all.length) % all.length]
}

function choose(id: ToolId) {
  // `toggle`, not `arm`: re-picking the armed tool disarms it. The top bar
  // is a `data-shortcut-boundary`, so Escape typed here never reaches the
  // global handler — without this there is no way out of draw mode from
  // the menu at all.
  toggle(id)
  open.value = false
  // Focus goes to the canvas rather than back to the trigger: the user has
  // just said what to draw and is about to draw it, and the canvas is
  // where Escape, Backspace and the digit shortcuts are live.
  workspaceElement.value?.focus()
}

function onMenuKeydown(event: KeyboardEvent) {
  const all = items()
  const index = all.indexOf(document.activeElement as HTMLButtonElement)

  if (event.key === 'Escape') close()
  else if (event.key === 'Tab') close({ restoreFocus: false })
  else if (event.key === 'ArrowDown') itemAt(index + 1)?.focus()
  else if (event.key === 'ArrowUp') itemAt(index - 1)?.focus()
  else if (event.key === 'Home') itemAt(0)?.focus()
  else if (event.key === 'End') itemAt(all.length - 1)?.focus()
  else return

  // Only once a key above matched. Escape in particular must not bubble:
  // it would reach nothing useful, and stopping it here is what the
  // shortcut boundary makes necessary.
  event.preventDefault()
  event.stopPropagation()
}

// An open menu left hanging over the canvas is a menu the next drag draws
// on top of, so a press anywhere else closes it.
onClickOutside(root, () => close({ restoreFocus: false }))
</script>

<template>
  <div ref="root" class="tool-menu">
    <button
      ref="trigger"
      type="button"
      class="tool-menu__trigger"
      :class="{ 'tool-menu__trigger--armed': armed !== null }"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-controls="tool-menu-list"
      :aria-label="triggerLabel"
      :title="triggerLabel"
      @click="open ? close() : openMenu()"
    >
      <span class="tool-menu__glyph" aria-hidden="true">▣</span>
      <span class="tool-menu__caret" aria-hidden="true">▾</span>
    </button>

    <div
      v-if="open"
      id="tool-menu-list"
      ref="list"
      class="tool-menu__list"
      role="menu"
      aria-label="Insert"
      @keydown="onMenuKeydown"
    >
      <button
        v-for="tool in TOOLS"
        :key="tool.id"
        type="button"
        role="menuitemradio"
        class="tool-menu__item"
        :class="{ 'tool-menu__item--armed': activeToolId === tool.id }"
        :aria-checked="activeToolId === tool.id"
        :aria-keyshortcuts="tool.shortcut"
        tabindex="-1"
        @click="choose(tool.id)"
      >
        <span class="tool-menu__label">{{ tool.label }}</span>
        <kbd class="tool-menu__shortcut">{{ tool.shortcut }}</kbd>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tool-menu {
  position: relative;
  display: inline-flex;
}

.tool-menu__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-fg-muted);
  background-color: transparent;
  border-radius: 0.375rem;
  cursor: pointer;
}

.tool-menu__trigger:hover {
  color: var(--color-fg-default);
  background-color: var(--color-surface-sunken);
}

/* A ring rather than a different glyph: the trigger is meant to read as
   one fixed affordance, so armed state is something drawn around it. */
.tool-menu__trigger--armed {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
}

.tool-menu__trigger--armed:hover {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent-hover);
}

.tool-menu__caret {
  font-size: 0.625rem;
  opacity: 0.7;
}

/* The top bar does not clip, so the menu hangs down over the rails and
   the canvas below it. */
.tool-menu__list {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 0;
  z-index: 1;
  display: grid;
  gap: 0.0625rem;
  min-width: 11rem;
  padding: 0.25rem;
  background-color: var(--color-surface-overlay);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.tool-menu__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.3125rem 0.5rem;
  font-size: 0.8125rem;
  color: var(--color-fg-muted);
  background-color: transparent;
  border-radius: 0.25rem;
  cursor: pointer;
}

.tool-menu__item:hover {
  color: var(--color-fg-default);
  background-color: var(--color-surface-sunken);
}

.tool-menu__item--armed {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
}

.tool-menu__item--armed:hover {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent-hover);
}

.tool-menu__shortcut {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  opacity: 0.7;
}
</style>
