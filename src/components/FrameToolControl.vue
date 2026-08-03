<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import ToolButton from '@/components/ToolButton.vue'
import { LAYOUT_VALUES } from '@/composables/styleSchema'
import type { NodeLayout } from '@/composables/useCanvasNodes'
import { useFrameTool } from '@/composables/useFrameTool'
import { useTools, type RegisteredTool } from '@/composables/useTools'

const props = defineProps<{
  tool: RegisteredTool
  orientation: 'horizontal' | 'vertical'
}>()

const { activeToolId, toggle, disarm } = useTools()
const { layout, setLayout } = useFrameTool()

const armed = computed(() => activeToolId.value === props.tool.id)

const button = useTemplateRef<InstanceType<typeof ToolButton>>('button')
const menu = useTemplateRef<HTMLElement>('menu')

/**
 * Whether the menu is showing — separate from `armed` because the two
 * diverge the moment a layout is chosen: choosing closes the menu but
 * deliberately leaves the tool armed, ready to draw with immediately.
 * Arming still opens it; the watcher below is what makes that happen.
 */
const menuOpen = ref(false)

/**
 * Focusing the checked radio when the menu opens is load-bearing, not a
 * nicety. `useCanvasShortcuts` binds keydown to the window and ignores
 * anything inside a `data-shortcut-boundary`, which the toolbar panel
 * carries. With focus inside the menu, a stray digit press doesn't re-arm
 * behind the menu's back — but it also means Escape typed there never
 * reaches the global handler, so closing needs its own local handler
 * below.
 */
watch(armed, async (isArmed) => {
  menuOpen.value = isArmed
  if (!isArmed) return
  await nextTick()
  menu.value?.querySelector<HTMLInputElement>('input:checked')?.focus()
})

function choose(value: NodeLayout) {
  setLayout(value)
  menuOpen.value = false
}

function closeAndDisarm() {
  disarm()
  button.value?.focus()
}
</script>

<template>
  <div class="frame-tool" :class="`frame-tool--${orientation}`">
    <ToolButton
      ref="button"
      :label="tool.label"
      :shortcut="tool.shortcut"
      :active="armed"
      aria-controls="frame-layout-menu"
      :aria-expanded="menuOpen"
      :title="`${tool.label} (${tool.shortcut})`"
      @click="toggle(tool.id)"
    />

    <!-- Native radios, matching ThemeToggle: single-select, so the browser
         gives arrow-key navigation and one tab stop for free. A custom
         roving tabindex is easy to get subtly wrong. -->
    <fieldset
      v-if="menuOpen"
      id="frame-layout-menu"
      ref="menu"
      class="frame-tool__menu"
      @keydown.esc.stop="closeAndDisarm"
    >
      <legend class="visually-hidden">Frame layout</legend>

      <label
        v-for="value in LAYOUT_VALUES"
        :key="value"
        class="frame-tool__option"
        :class="{ 'frame-tool__option--active': layout === value }"
      >
        <input
          type="radio"
          name="frame-layout"
          class="visually-hidden"
          :value="value"
          :checked="layout === value"
          @change="choose(value)"
        />
        <span>{{ value }}</span>
      </label>
    </fieldset>
  </div>
</template>

<style scoped>
.frame-tool {
  position: relative;
  display: inline-flex;
}

/* The panel has no overflow clipping, so the menu escapes it freely. */
.frame-tool__menu {
  position: absolute;
  z-index: 1;
  display: grid;
  gap: 0.125rem;
  min-width: 8rem;
  margin: 0;
  padding: 0.25rem;
  background-color: var(--color-surface-overlay);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.frame-tool--horizontal .frame-tool__menu {
  top: calc(100% + 0.25rem);
  left: 0;
}

.frame-tool--vertical .frame-tool__menu {
  top: 0;
  left: calc(100% + 0.25rem);
}

.frame-tool__option {
  padding: 0.25rem 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-fg-muted);
  border-radius: 0.25rem;
  cursor: pointer;
}

.frame-tool__option:hover {
  color: var(--color-fg-default);
  background-color: var(--color-surface);
}

.frame-tool__option--active {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
}

/* The input is visually hidden, so surface its focus ring on the label. */
.frame-tool__option:has(input:focus-visible) {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
