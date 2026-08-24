<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  VIEWPORT_ID,
  isViewport,
  useCanvasNodes,
  walkNodes,
  type CanvasNode,
  type NodeId,
} from '@/composables/useCanvasNodes'
import { LAYOUT_LABEL } from '@/composables/useTools'

/**
 * The node tree, as a list you can select and delete from.
 *
 * Deliberately reads the store rather than the DOM — `walkNodes` walks
 * `childrenIds`, so the panel shows the document, not whatever happens to
 * have rendered.
 *
 * Not yet, and each for a reason:
 *
 *   Renaming — needs a `name` field on the node, which brings a rename
 *   affordance, a default-naming policy and persistence with it. The
 *   labels here are derived instead, so nothing can go stale.
 *
 *   Drag to reparent — `moveNode` already does the tree write safely, but
 *   it does not reconcile geometry: an absolutely positioned node dragged
 *   into a different parent keeps its old parent-local offsets and jumps
 *   on screen by the difference between the two origins. Doing it
 *   properly means measuring before the move and rewriting the pins
 *   after. Dragging on the canvas already reorders within a parent.
 */
const { selectedId, selectNode, removeNode } = useCanvasNodes()

interface LayerRow {
  id: NodeId
  depth: number
  label: string
  hasChildren: boolean
  /** The viewport is the document itself — it cannot be deleted. */
  removable: boolean
}

/** Folded-away subtrees. View state, so it stays out of the store. */
const collapsed = ref(new Set<NodeId>())

function toggle(id: NodeId) {
  const next = new Set(collapsed.value)
  if (!next.delete(id)) next.add(id)
  collapsed.value = next
}

function labelFor(node: CanvasNode) {
  // Matches the viewport bar on the canvas, which calls it the page.
  return isViewport(node.id) ? 'Page' : LAYOUT_LABEL[node.layout]
}

/**
 * One row per visible node, in the order the canvas paints them.
 *
 * The depth map works only because `walkNodes` yields parents before
 * children — a child's depth is read from an entry its parent has already
 * written. Same reason `hidden` can be a plain set: an ancestor is always
 * seen before the descendants it hides.
 */
const rows = computed<LayerRow[]>(() => {
  const depths = new Map<NodeId, number>()
  const hidden = new Set<NodeId>()
  const out: LayerRow[] = []

  for (const node of walkNodes(VIEWPORT_ID)) {
    const parentId = node.parentId
    const depth = parentId === null ? 0 : (depths.get(parentId) ?? 0) + 1
    depths.set(node.id, depth)

    if (parentId !== null && (hidden.has(parentId) || collapsed.value.has(parentId))) {
      hidden.add(node.id)
      continue
    }

    out.push({
      id: node.id,
      depth,
      label: labelFor(node),
      hasChildren: node.childrenIds.length > 0,
      removable: !isViewport(node.id),
    })
  }

  return out
})
</script>

<template>
  <ul class="layers">
    <li
      v-for="row in rows"
      :key="row.id"
      class="layers__row"
      :class="{ 'layers__row--selected': selectedId === row.id }"
      :style="{ '--depth': row.depth }"
    >
      <!-- A fixed-size placeholder when there is nothing to fold, so every
           label on a level starts at the same x. -->
      <button
        v-if="row.hasChildren"
        type="button"
        class="layers__twisty"
        :aria-expanded="!collapsed.has(row.id)"
        :aria-label="`${collapsed.has(row.id) ? 'Expand' : 'Collapse'} ${row.label}`"
        @click="toggle(row.id)"
      >
        {{ collapsed.has(row.id) ? '▸' : '▾' }}
      </button>
      <span v-else class="layers__twisty layers__twisty--empty" aria-hidden="true" />

      <button
        type="button"
        class="layers__label"
        :aria-current="selectedId === row.id"
        @click="selectNode(row.id)"
      >
        {{ row.label }}
      </button>

      <!-- The rail is a shortcut boundary, so Backspace on a focused row
           deliberately does nothing. Without this there would be no way to
           delete from the panel at all. -->
      <button
        v-if="row.removable"
        type="button"
        class="layers__remove"
        :aria-label="`Delete ${row.label}`"
        @click="removeNode(row.id)"
      >
        ×
      </button>
    </li>
  </ul>
</template>

<style scoped>
.layers {
  display: grid;
  gap: 0.0625rem;
}

.layers__row {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding-inline-start: calc(var(--depth) * 0.75rem);
  border-radius: 0.25rem;
}

.layers__row:hover {
  background-color: var(--color-surface-sunken);
}

.layers__row--selected {
  background-color: var(--color-accent);
}

.layers__row--selected .layers__label,
.layers__row--selected .layers__twisty,
.layers__row--selected .layers__remove {
  color: var(--color-fg-on-accent);
}

.layers__twisty {
  width: 1rem;
  font-size: 0.625rem;
  color: var(--color-fg-subtle);
  background-color: transparent;
  cursor: pointer;
}

.layers__twisty--empty {
  cursor: default;
}

.layers__label {
  flex: 1;
  padding: 0.25rem 0.125rem;
  font-size: 0.8125rem;
  text-align: start;
  color: var(--color-fg-default);
  background-color: transparent;
  cursor: pointer;
}

/* Revealed on hover or focus rather than always shown: a delete on every
   row, all the time, reads as the panel's main action. */
.layers__remove {
  padding: 0 0.375rem;
  font-size: 0.875rem;
  color: var(--color-fg-subtle);
  background-color: transparent;
  border-radius: 0.25rem;
  opacity: 0;
  cursor: pointer;
}

.layers__row:hover .layers__remove,
.layers__remove:focus-visible {
  opacity: 1;
}

.layers__remove:hover {
  color: var(--color-danger-text);
}
</style>
