<script setup lang="ts">
import ThemeToggle from '@/components/ThemeToggle.vue'
import ToolMenu from '@/components/ToolMenu.vue'

/**
 * The docked bar across the top of the builder: what to draw on the
 * left, what is being worked on in the middle, and who is working on it
 * on the right.
 *
 * Carries `data-shortcut-boundary` for the same reason the old floating
 * panels did — this is chrome, so a keystroke here belongs to whatever
 * control has focus. Backspace on a tool button is not a request to
 * delete the selection. See `useCanvasShortcuts`.
 */
</script>

<template>
  <header class="topbar" data-shortcut-boundary>
    <div class="topbar__group">
      <ToolMenu />
    </div>

    <div class="topbar__group topbar__group--center">
      <span class="topbar__project">no-code</span>
      <!-- Dressing: spans rather than disabled buttons, because a disabled
           button promises a control that will exist. These are a picture
           of one. `aria-hidden` keeps them out of the tab order and the
           accessibility tree, where they would otherwise be noise. -->
      <span class="topbar__branch" aria-hidden="true">· main</span>
    </div>

    <div class="topbar__group topbar__group--end">
      <ThemeToggle />
      <span class="topbar__avatar" aria-hidden="true">AB</span>
      <span class="topbar__cta" aria-hidden="true">Invite</span>
      <span class="topbar__cta topbar__cta--accent" aria-hidden="true">Publish</span>
    </div>
  </header>
</template>

<style scoped>
/* Placement, surface and the divider below come from App.vue, which owns
   how the window is divided. Only the bar's own contents are here. */
.topbar {
  display: grid;
  /* Equal outer tracks, so the centre group is centred against the bar
     rather than against whatever the two ends happen to measure. */
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.75rem;
}

.topbar__group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.topbar__group--center {
  justify-content: center;
  gap: 0.375rem;
}

.topbar__group--end {
  justify-content: flex-end;
  gap: 0.5rem;
}

.topbar__project {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-fg-default);
  white-space: nowrap;
}

.topbar__branch {
  font-size: 0.8125rem;
  color: var(--color-fg-subtle);
  white-space: nowrap;
}

.topbar__avatar {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
  border-radius: 50%;
}

/* Inert by construction, not just by omission: no pointer feedback, and
   nothing to press. */
.topbar__cta {
  padding: 0.3125rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--color-fg-muted);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  pointer-events: none;
  white-space: nowrap;
}

.topbar__cta--accent {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
  border-color: transparent;
}
</style>
