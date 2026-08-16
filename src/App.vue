<script setup lang="ts">
import { onMounted } from 'vue'

import BuilderToolbar from '@/components/BuilderToolbar.vue'
import BuilderWorkspace from '@/components/BuilderWorkspace.vue'
import CanvasZoomControls from '@/components/CanvasZoomControls.vue'
import StyleInspector from '@/components/StyleInspector.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { fitToDocument } from '@/composables/useCanvasView'
import { viewportHeight, viewportWidth } from '@/composables/useViewport'

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
 */
onMounted(() => {
  fitToDocument({ width: viewportWidth.value, height: viewportHeight.value })
})
</script>

<template>
  <main class="page">
    <BuilderWorkspace />

    <!-- Both float above the workspace and are freely moveable, so the
         workspace keeps its full width — no space is reserved for them. -->
    <BuilderToolbar />
    <StyleInspector />

    <CanvasZoomControls />

    <div class="theme-toggle-wrapper">
      <ThemeToggle />
    </div>

    <!--
      Kept for reference: this demonstrated the theme tokens before the
      builder existed. The workspace is the page content now.

    <section class="card">
      <p>Default text — the primary reading colour.</p>
      <p class="muted">Muted text — secondary information.</p>
      <p class="subtle">Subtle text — captions, hints, metadata.</p>
      <button type="button" class="btn btn--accent">Accent button</button>
      <button type="button" class="btn btn--danger">Danger button</button>
    </section>
    -->
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
}

.theme-toggle-wrapper {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  /* Above the workspace, so it stays clickable even while a tool is
     armed and the workspace is capturing drags. */
  z-index: 20;
  display: flex;
  justify-content: flex-end;
}

/* The demo card's styles lived here. Removed rather than kept alongside
   the commented-out markup: scoped CSS is not tree-shaken against a
   commented template, so they were still being compiled into the bundle.
   Recoverable from git if the demo is ever restored. */
</style>
