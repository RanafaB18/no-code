<script setup lang="ts">
import { computed } from 'vue'

import { toStyleBinding } from '@/composables/styleSchema'
import { getNode, type NodeId } from '@/composables/useCanvasNodes'

/**
 * Renders one canvas node and, recursively, its children.
 *
 * `nodeId` is the ONLY prop, and deliberately a string: a primitive can
 * never change identity, so this component cannot be re-rendered by its
 * parent passing "new" data. It re-renders only when the one store entry
 * it looks up actually mutates — which is what keeps a style edit on one
 * node from touching any other.
 *
 * Never accept node data as a prop. Passing the object down would couple
 * every child's render to its ancestors' identities and undo that.
 */
const props = defineProps<{ nodeId: NodeId }>()

/** O(1), and reactive to this key alone. */
const node = computed(() => getNode(props.nodeId))

const styleBinding = computed(() => toStyleBinding(node.value?.styles ?? {}))
</script>

<template>
  <!--
    Guarded because a parent's `childrenIds` and the store are two separate
    pieces of state: an id can briefly outlive the entry it points at once
    deletion exists. Rendering nothing is the correct response.
  -->
  <div v-if="node" class="canvas-node" :data-node-id="nodeId" :style="styleBinding">
    <NodeRenderer v-for="childId in node.childrenIds" :key="childId" :node-id="childId" />
  </div>
</template>

<style scoped>
.canvas-node {
  /* A node with no background is invisible despite having size, so the
     editor outlines it. An editor affordance, deliberately not part of the
     node's own styles, so it never leaks into the CSS being authored. */
  outline: 1px dashed var(--color-border);
  outline-offset: -1px;
}
</style>
