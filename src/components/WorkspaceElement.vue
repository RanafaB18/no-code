<script setup lang="ts">
import { computed } from 'vue'

import { toStyleBinding } from '@/composables/styleSchema'
import type { WorkspaceElement } from '@/composables/useWorkspaceElements'

const props = defineProps<{ element: WorkspaceElement }>()

/**
 * A component per element so the style binding is scoped to it.
 *
 * Built inline in the parent's `v-for`, this ran for every element on
 * every workspace re-render — and the workspace re-renders on each
 * pointermove while drawing, because the drag ghost updates. As a
 * computed on a child, it recomputes only when this element's own styles
 * change, and the other elements don't re-render at all.
 */
const styleBinding = computed(() => toStyleBinding(props.element.styles))
</script>

<template>
  <!--
    data-element-id is how the workspace finds this node to measure the
    selection frame. An attribute lookup at measure time costs nothing
    per render, unlike a template ref callback, which Vue re-invokes
    (unsetting then resetting) whenever the parent re-renders.
  -->
  <div class="workspace-element" :data-element-id="element.id" :style="styleBinding" />
</template>

<style scoped>
.workspace-element {
  /* An element with no background is still invisible despite having
     size, so the editor outlines it. This is an editor affordance and
     deliberately not part of the element's own styles, so it never
     leaks into the CSS the user is authoring. */
  outline: 1px dashed var(--color-border);
  outline-offset: -1px;
}
</style>
