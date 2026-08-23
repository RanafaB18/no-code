<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

/**
 * `empty` is what the tab shows until it has something to show.
 *
 * Pages and Assets have no model behind them at all yet, and say so
 * rather than displaying invented content — a tab that lies about being
 * implemented is worse than one that admits it isn't.
 */
const TABS = [
  { id: 'pages', label: 'Pages', empty: 'This document has one page.' },
  { id: 'layers', label: 'Layers', empty: 'Draw something to see it here.' },
  { id: 'assets', label: 'Assets', empty: 'No assets yet.' },
] as const

type TabId = (typeof TABS)[number]['id']

/**
 * The docked rail down the left of the builder.
 *
 * Only Layers has anything behind it — the node tree is a real model, and
 * Pages and Assets are not, so they say so rather than showing invented
 * content.
 *
 * Tabs are buttons with `role="tab"` and a roving tabindex rather than
 * native radios, despite `ThemeToggle` making the opposite call for its
 * own segmented control: radios announce as a choice of value, and these
 * choose which panel is showing. The roving tabindex is what a tablist
 * has to supply by hand — one tab stop for the whole strip, arrows to
 * move within it.
 */
const active = ref<TabId>('layers')

const strip = useTemplateRef<HTMLElement>('strip')

function focusTab(index: number) {
  const tabs = strip.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  // Wraps at both ends, which is what the tab pattern specifies.
  tabs?.[(index + TABS.length) % TABS.length]?.focus()
}

function onKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') focusTab(index + 1)
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') focusTab(index - 1)
  else if (event.key === 'Home') focusTab(0)
  else if (event.key === 'End') focusTab(TABS.length - 1)
  else return

  // Only once a key above matched, so an unhandled key still reaches the
  // rest of the app.
  event.preventDefault()
}
</script>

<template>
  <aside class="rail rail--left" data-shortcut-boundary aria-label="Project">
    <div ref="strip" class="rail__tabs" role="tablist" aria-label="Sidebar sections">
      <button
        v-for="(tab, index) in TABS"
        :id="`rail-tab-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        class="rail__tab"
        :class="{ 'rail__tab--active': active === tab.id }"
        :aria-selected="active === tab.id"
        :aria-controls="`rail-panel-${tab.id}`"
        :tabindex="active === tab.id ? 0 : -1"
        @click="active = tab.id"
        @keydown="onKeydown($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div
      v-for="tab in TABS"
      v-show="active === tab.id"
      :id="`rail-panel-${tab.id}`"
      :key="tab.id"
      class="rail__panel"
      role="tabpanel"
      :aria-labelledby="`rail-tab-${tab.id}`"
    >
      <p class="rail__empty">{{ tab.empty }}</p>
    </div>
  </aside>
</template>

<style scoped>
/* Placement, surface and the divider come from App.vue, which owns how
   the window is divided. Only the rail's own contents are here. */
.rail__tabs {
  display: flex;
  gap: 0.125rem;
  padding: 0.375rem;
  border-bottom: 1px solid var(--color-border);
}

.rail__tab {
  padding: 0.25rem 0.5rem;
  font-size: 0.8125rem;
  color: var(--color-fg-muted);
  background-color: transparent;
  border-radius: 0.25rem;
  cursor: pointer;
}

.rail__tab:hover {
  color: var(--color-fg-default);
}

.rail__tab--active {
  color: var(--color-fg-default);
  background-color: var(--color-surface-sunken);
}

.rail__panel {
  /* Scrolls itself rather than growing the shell, which never scrolls.
     `scrollbar-gutter` keeps the scrollbar's arrival from reflowing the
     content beside it. */
  flex: 1;
  min-height: 0;
  padding: 0.75rem;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.rail__empty {
  font-size: 0.8125rem;
  color: var(--color-fg-muted);
}
</style>
