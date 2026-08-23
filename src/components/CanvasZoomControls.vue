<script setup lang="ts">
import { computed } from 'vue'

import { fitToDocument, resetView, zoom, zoomBy } from '@/composables/useCanvasView'
import { workspaceSize } from '@/composables/useWorkspaceRect'

/**
 * Fit / reset / step controls for the infinite canvas, plus a live zoom
 * readout.
 *
 * A sibling of the workspace, not a part of it — same posture as
 * `ThemeToggle`: chrome that floats over the canvas rather than
 * participating in it, so it carries `data-shortcut-boundary` and reads
 * `useCanvasView()` directly rather than taking props.
 *
 * A clean doubling per click (2×, not some fussier 1.25×) is deliberate:
 * it is an easy step to reason about, and it lands on exact numbers
 * (50%, 100%, 200%) rather than compounding float drift — which matters
 * here specifically because e2e tests click these buttons to reach a
 * known zoom.
 */
const ZOOM_STEP = 2

/**
 * The middle of the canvas cell, which is already a workspace point —
 * `zoomBy` wants one of those, so unlike a pointer position there is
 * nothing to rebase here.
 *
 * The cell rather than the window: with the rails taking real space out
 * of the window, zooming about the window's centre would walk the design
 * steadily toward whichever rail is wider.
 */
function canvasCenter() {
  return { x: workspaceSize.value.width / 2, y: workspaceSize.value.height / 2 }
}

function handleZoomIn() {
  zoomBy(ZOOM_STEP, canvasCenter())
}

function handleZoomOut() {
  zoomBy(1 / ZOOM_STEP, canvasCenter())
}

function handleFit() {
  fitToDocument(workspaceSize.value)
}

const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
</script>

<template>
  <div class="zoom-controls" data-shortcut-boundary>
    <button type="button" aria-label="Zoom out" @click="handleZoomOut">−</button>
    <button type="button" class="zoom-controls__reset" aria-label="Reset zoom" @click="resetView">
      {{ zoomLabel }}
    </button>
    <button type="button" aria-label="Zoom in" @click="handleZoomIn">+</button>
    <button type="button" class="zoom-controls__fit" @click="handleFit">Fit</button>
  </div>
</template>

<style scoped>
.zoom-controls {
  position: fixed;
  bottom: 1.5rem;
  left: 1.5rem;
  z-index: 20;
  display: flex;
  align-items: stretch;
  gap: 1px;
  overflow: hidden;
  background-color: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.zoom-controls button {
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
  color: var(--color-fg-default);
  background-color: transparent;
  border: none;
  cursor: pointer;
}

.zoom-controls button:hover {
  background-color: var(--color-surface-sunken);
}

/* A fixed width, so the control's overall size does not jump as the
   percentage grows or shrinks a digit. */
.zoom-controls__reset {
  min-width: 3.5rem;
  font-variant-numeric: tabular-nums;
}

.zoom-controls__fit {
  border-left: 1px solid var(--color-border);
}
</style>
