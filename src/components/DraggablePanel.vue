<script setup lang="ts">
import { useTemplateRef } from 'vue'

import { useDraggablePanel, type PanelAnchor } from '@/composables/useDraggablePanel'

/**
 * The floating-panel chrome shared by the toolbar and the inspector:
 * fixed positioning, the drag handle and its cursor states, and the
 * surface styling. Both previously duplicated all of it.
 *
 * The `handle` slot is the grab area. It is a slot rather than a fixed
 * bar because the two panels want different content there — a bare grip
 * versus a grip plus title — while needing identical drag behaviour.
 */
const props = defineProps<{
  anchor: PanelAnchor
  /** Surface token to fill with; panels sit at different depths. */
  surface?: 'raised' | 'sunken'
}>()

// useTemplateRef, not a ref from the composable: only a ref the component
// itself owns will bind to a `ref="..."` in its own template.
const panel = useTemplateRef<HTMLElement>('panel')
const handle = useTemplateRef<HTMLElement>('handle')

const { isDragging, style, settle } = useDraggablePanel({ panel, handle }, props.anchor)

// Panels that change their own dimensions (the toolbar, when it switches
// orientation) need to re-settle afterwards.
defineExpose({ settle })
</script>

<template>
  <div
    ref="panel"
    class="panel"
    :class="[`panel--${surface ?? 'raised'}`, { 'panel--dragging': isDragging }]"
    :style="style"
  >
    <div ref="handle" class="panel__handle">
      <slot name="handle" />
    </div>

    <slot />
  </div>
</template>

<style scoped>
.panel {
  position: fixed;
  /* Above the workspace, so panels stay usable while a tool is armed and
     the workspace is capturing drags. */
  z-index: 20;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.panel--raised {
  background-color: var(--color-surface-raised);
}

.panel--sunken {
  background-color: var(--color-surface-sunken);
}

.panel--dragging {
  /* Signals the panel is detached and following the pointer. */
  opacity: 0.9;
}

.panel__handle {
  cursor: grab;
  user-select: none;
}

.panel--dragging .panel__handle {
  cursor: grabbing;
}
</style>
