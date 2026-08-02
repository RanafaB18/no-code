<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'

import DraggablePanel from '@/components/DraggablePanel.vue'
import { anchorTopCenter } from '@/composables/useDraggablePanel'
import { TOOLS, useTools } from '@/composables/useTools'

const { activeToolId, toggle } = useTools()

const panel = useTemplateRef<InstanceType<typeof DraggablePanel>>('panel')

/** Local to the toolbar — the inspector has no orientation to switch. */
const orientation = ref<'horizontal' | 'vertical'>('horizontal')

const nextOrientation = computed(() =>
  orientation.value === 'vertical' ? 'horizontal' : 'vertical',
)

function toggleOrientation() {
  orientation.value = nextOrientation.value
  // Width and height swap, so a position that fitted may no longer.
  nextTick(() => panel.value?.settle())
}
</script>

<template>
  <DraggablePanel
    ref="panel"
    class="toolbar"
    :class="`toolbar--${orientation}`"
    :anchor="anchorTopCenter"
    surface="sunken"
    role="group"
    aria-label="Element tools"
  >
    <template #handle>
      <span aria-hidden="true">⠿</span>
    </template>

    <!-- Rendered from TOOLS, so a new tool appears by adding one entry.
         aria-pressed rather than a radiogroup: a tool can be toggled off
         entirely, leaving idle/select mode, which radios can't express. -->
    <button
      v-for="tool in TOOLS"
      :key="tool.id"
      type="button"
      class="toolbar__button"
      :class="{ 'toolbar__button--active': activeToolId === tool.id }"
      :aria-pressed="activeToolId === tool.id"
      :aria-keyshortcuts="tool.shortcut"
      :title="`${tool.label} (${tool.shortcut})`"
      @click="toggle(tool.id)"
    >
      <span>{{ tool.label }}</span><sub class="toolbar__shortcut">{{ tool.shortcut }}</sub>
    </button>

    <button
      type="button"
      class="toolbar__orientation"
      :title="`Switch to ${nextOrientation} layout`"
      :aria-label="`Switch to ${nextOrientation} layout`"
      @click="toggleOrientation"
    >
      {{ orientation === 'vertical' ? '⇄' : '⇅' }}
    </button>
  </DraggablePanel>
</template>

<style scoped>
/* Positioning, surface and handle chrome all come from DraggablePanel;
   only the toolbar's own layout and controls are here. */
.toolbar {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
}

.toolbar--horizontal {
  flex-direction: row;
  align-items: center;
}

.toolbar--vertical {
  flex-direction: column;
  align-items: stretch;
}

.toolbar :deep(.panel__handle) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  color: var(--color-fg-subtle);
}

.toolbar__button {
  position: relative;
  display: inline-flex;
  align-items: center;
  /* Extra right padding keeps the label clear of the corner shortcut. */
  padding: 0.375rem 0.9rem 0.375rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-fg-muted);
  background-color: transparent;
  border-radius: 0.375rem;
  cursor: pointer;
}

.toolbar__button:hover {
  color: var(--color-fg-default);
}

.toolbar__button--active {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
}

.toolbar__button--active:hover {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent-hover);
}

/* Tucked into the button's bottom-right corner rather than trailing the
   label, so it reads as an annotation on the tool instead of part of its
   name. Absolutely positioned, so <sub>'s own baseline shift is moot. */
.toolbar__shortcut {
  position: absolute;
  right: 0.3rem;
  bottom: 0.15rem;
  font-size: 0.5625rem;
  line-height: 1;
  opacity: 0.6;
}

.toolbar__orientation {
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  color: var(--color-fg-muted);
  background-color: transparent;
  border-radius: 0.375rem;
  cursor: pointer;
}

.toolbar__orientation:hover {
  color: var(--color-fg-default);
  background-color: var(--color-surface);
}
</style>
