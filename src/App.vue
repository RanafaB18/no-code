<script setup lang="ts">
import { onMounted } from 'vue'

import BuilderSidebar from '@/components/BuilderSidebar.vue'
import BuilderTopBar from '@/components/BuilderTopBar.vue'
import BuilderWorkspace from '@/components/BuilderWorkspace.vue'
import CanvasZoomControls from '@/components/CanvasZoomControls.vue'
import StyleInspector from '@/components/StyleInspector.vue'
import { fitToDocument } from '@/composables/useCanvasView'
import { workspaceSize } from '@/composables/useWorkspaceRect'

/**
 * Centres the design once, when the app first loads — the entire point of
 * moving to an infinite canvas rather than a page pinned to a corner.
 *
 * Lives here rather than in `BuilderWorkspace.vue`'s own mount: the real
 * app mounts the workspace exactly once, so the two are equivalent in
 * production, but `BuilderWorkspace.spec.ts` mounts it fresh dozens of
 * times as an isolated unit and asserts exact geometry from raw pointer
 * coordinates — coordinates that assume `pan`/`zoom` are still identity.
 * Keeping this app-level, where no test asserts canvas coordinates,
 * avoids re-fitting (and re-breaking that assumption) on every one of
 * those mounts.
 *
 * Being the parent's hook is also what makes `workspaceSize` readable by
 * now: Vue mounts children first, so the workspace has already measured
 * its own cell by the time this runs.
 */
onMounted(() => {
  fitToDocument(workspaceSize.value)
})
</script>

<template>
  <main class="shell">
    <BuilderTopBar />
    <BuilderSidebar />

    <!-- The canvas cell, not the workspace itself. The zoom controls float
         over the canvas but must not be *part* of it: inside `.workspace`
         their clicks would bubble into its pointer handlers and clear the
         selection, or start drawing when a tool is armed. A positioned
         wrapper keeps them siblings, which is the arrangement that already
         worked when both floated over a full-window canvas. -->
    <div class="shell__canvas">
      <BuilderWorkspace />
      <CanvasZoomControls />
    </div>

    <StyleInspector />
  </main>
</template>

<style scoped>
.shell {
  /* Widths live here rather than in each rail: they are a statement about
     how the window is divided, and the rails are what fills the result. */
  --topbar-height: 3rem;
  --rail-left: 15rem;
  /* Wider than the 16rem the inspector used to declare for itself. That
     width never actually fitted its widest row — the size pair needs
     ~308px — and a floating panel simply overflowed into a horizontal
     scrollbar. A docked track has to be honest about it. */
  --rail-right: 21rem;

  display: grid;
  grid-template-columns: var(--rail-left) minmax(0, 1fr) var(--rail-right);
  grid-template-rows: var(--topbar-height) minmax(0, 1fr);
  grid-template-areas:
    'topbar topbar topbar'
    'rail-left canvas rail-right';
  /* dvh, not vh: on a mobile browser whose chrome retracts on scroll, vh
     is the *largest* viewport, so the bottom of the shell would sit under
     the address bar. */
  height: 100dvh;
  /* The shell itself never scrolls — the canvas pans and the rails scroll
     internally. `minmax(0, 1fr)` above is the other half of that: without
     it a track is floored by its content's min-content size and the grid
     grows past the window instead of the content overflowing inside it. */
  overflow: hidden;
}

.shell__canvas {
  grid-area: canvas;
  /* The containing block for the workspace and the zoom controls, both
     absolutely positioned within it. */
  position: relative;
  /* Its own stacking context, so nothing inside the canvas — a selection
     frame, a drag ghost — can paint over a rail no matter its z-index. */
  z-index: 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* Where each region sits and what separates it from the next, kept here
   rather than in the four components: this is one statement about how the
   window is divided, and splitting it across the pieces being divided
   makes it unreadable. Each component still owns its own insides.

   These reach the components because Vue's `scoped` applies the parent's
   scope id to a child component's ROOT element — which is exactly why the
   rules below are all root-element selectors, and why anything nested
   deeper has to stay in the child's own stylesheet. */
.topbar {
  grid-area: topbar;
  /* Above the rails, so a menu opened in the bar hangs down over them. */
  z-index: 20;
  background-color: var(--color-surface-raised);
  border-bottom: 1px solid var(--color-border);
}

.rail {
  /* Above the canvas cell, below the top bar. */
  z-index: 10;
  display: flex;
  flex-direction: column;
  /* A grid item's default `min-height: auto` floors it at its content's
     height, which would push a long rail past the bottom of the window
     instead of letting it scroll inside. */
  min-height: 0;
  background-color: var(--color-surface-raised);
}

.rail--left {
  grid-area: rail-left;
  border-right: 1px solid var(--color-border);
}

.rail--right {
  grid-area: rail-right;
  border-left: 1px solid var(--color-border);
}
</style>
