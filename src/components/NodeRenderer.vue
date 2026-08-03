<script setup lang="ts">
import { computed } from 'vue'

import { toStyleBinding } from '@/composables/styleSchema'
import {
  getNode,
  isViewport,
  resolvedPosition,
  stretchesAxis,
  type CanvasNode,
  type NodeId,
  type SizeAxis,
} from '@/composables/useCanvasNodes'

/**
 * Renders one canvas node and, recursively, its children.
 *
 * `nodeId` is the ONLY prop, and deliberately a string: a primitive can
 * never change identity, so this component cannot be re-rendered by its
 * parent passing "new" data. It re-renders only when the one store entry
 * it looks up actually mutates.
 *
 * Never accept node data as a prop. Passing the object down would couple
 * every child's render to its ancestors' identities and undo that.
 */
const props = defineProps<{ nodeId: NodeId }>()

/** O(1), and reactive to this key alone. */
const node = computed(() => getNode(props.nodeId))

function px(value: number | undefined) {
  return value === undefined ? undefined : `${value}px`
}

/**
 * One axis's size, as the mode says to read the stored number.
 *
 * `fill` emits nothing here on purpose: it is not a length at all but a
 * claim on the space siblings leave, which `fillFor` expresses instead.
 */
function sizeFor(current: CanvasNode, axis: SizeAxis) {
  const mode = axis === 'width' ? current.widthMode : current.heightMode
  const value = current[axis]

  if (mode === 'fit') return 'fit-content'
  if (value === undefined) return undefined
  // `fit-content` rather than `auto`, which in a flex container's cross
  // axis means "stretch" — the opposite of shrinking to your contents.
  return mode === 'relative' ? `${value}%` : px(value)
}

/**
 * What makes `fill` fill.
 *
 * Only a parent that lays this node out can grant it: along a flex main
 * axis it is `flex-grow`, and across that axis — or in a grid — it is
 * `stretch`, which needs the size itself left auto to have any effect.
 */
function fillFor(current: CanvasNode, axis: SizeAxis) {
  const mode = axis === 'width' ? current.widthMode : current.heightMode
  const parent = getNode(current.parentId)
  if (mode !== 'fill' || !parent || resolvedPosition(current) !== 'relative') return {}

  if (parent.layout === 'grid') {
    return axis === 'width' ? { justifySelf: 'stretch' } : { alignSelf: 'stretch' }
  }
  if (parent.layout !== 'flex') return {}

  const mainAxis: SizeAxis = parent.styles.flexDirection === 'column' ? 'height' : 'width'
  // `flex-basis: 0` so siblings that both fill share the space evenly,
  // rather than each keeping its content width and splitting the remainder.
  return axis === mainAxis ? { flexGrow: '1', flexBasis: '0' } : { alignSelf: 'stretch' }
}

/**
 * Geometry only applies when the node positions itself. Under a flex or
 * grid parent the offsets are meaningless — the parent places it — so
 * they are withheld rather than emitted and ignored, which keeps the DOM
 * an honest reflection of what is actually in effect.
 *
 * Width and height apply either way.
 */
function geometryFor(current: CanvasNode) {
  const position = resolvedPosition(current)
  const size = {
    width: sizeFor(current, 'width'),
    height: sizeFor(current, 'height'),
    ...fillFor(current, 'width'),
    ...fillFor(current, 'height'),
  }

  if (position !== 'absolute') return size
  return {
    ...size,
    // Pinning both edges of an axis derives the size from the parent, so
    // the stated one is withheld. Emitting all three over-constrains the
    // box, and CSS resolves that by dropping `right` — silently undoing
    // the pin just set, which would read as the widget being broken.
    width: stretchesAxis(current, 'width') ? undefined : size.width,
    height: stretchesAxis(current, 'height') ? undefined : size.height,
    left: px(current.left),
    right: px(current.right),
    top: px(current.top),
    bottom: px(current.bottom),
  }
}

/**
 * Layout is a first-class field rather than a raw `display` string, so it
 * maps here. `none` means "this frame imposes nothing" — its children
 * position themselves — which is `display: block`, not `display: none`.
 */
function displayFor(current: CanvasNode) {
  return current.layout === 'none' ? undefined : current.layout
}

const binding = computed(() => {
  const current = node.value
  if (!current) return {}

  return {
    // Authored CSS first, so geometry and positioning always win over a
    // stray hand-typed value — they are the fields the canvas manipulates.
    ...toStyleBinding(current.styles),
    ...geometryFor(current),
    display: displayFor(current),
    // Never `static`: a static frame is invisible to the containing-block
    // search, so its absolute children would escape and position against
    // a distant ancestor instead of it.
    position: resolvedPosition(current),
  }
})
</script>

<template>
  <!--
    Guarded because a parent's `childrenIds` and the store are two separate
    pieces of state: an id can briefly outlive the entry it points at when
    a node is removed. Rendering nothing is the correct response.
  -->
  <div
    v-if="node"
    class="canvas-node"
    :class="{ 'canvas-node--viewport': isViewport(nodeId) }"
    :data-node-id="nodeId"
    :style="binding"
  >
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

/*
 * Not `content-visibility: auto` here, despite being the obvious cheap
 * first move for a large document.
 *
 * It turns on paint containment *at all times*, not only while a subtree
 * is being skipped, and paint containment clips descendants to the padding
 * box. On an absolute canvas a child drawn past its parent's edge is
 * ordinary — and `overflow` is offered as the one property that clips, so
 * a frame must not be clipping already. Measured rather than assumed: with
 * the rule in place, `e2e/overflow.spec.ts` finds nothing painted at a
 * point the overhanging child covers.
 *
 * Culling subtrees whose geometry falls outside the viewport is the
 * remaining lever, and that reads the stored rect rather than asking the
 * browser to lay anything out.
 */

/* The page being designed, against the surrounding canvas. */
.canvas-node--viewport {
  background-color: var(--color-surface-raised);
  outline-color: var(--color-border-strong);
}
</style>
