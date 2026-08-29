<script setup lang="ts">
import type { ToolId } from '@/composables/useTools'

/**
 * The glyph for a tool — shared by the trigger, which shows whichever
 * tool is armed, and the menu's own list, so the two can never quietly
 * end up drawing different icons for the same tool.
 *
 * One rectangle, always: a plain frame is the base case every tool draws.
 * Flex adds a line down its middle — the tool has no `flexDirection` of
 * its own, so it defaults to CSS's `row`, and its two seeded children
 * really do sit side by side. Grid adds the second line that turns it
 * into four. Each icon is a literal subset of the next, the same way its
 * seeded children are a subset of the next tool's.
 */
defineProps<{ tool: ToolId }>()
</script>

<template>
  <svg
    class="tool-icon"
    viewBox="0 0 16 16"
    width="14"
    height="14"
    fill="none"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
    <path v-if="tool === 'flex' || tool === 'grid'" d="M8 3.5v9" />
    <path v-if="tool === 'grid'" d="M2.5 8h11" />
  </svg>
</template>

<style scoped>
.tool-icon {
  flex-shrink: 0;
  stroke: currentColor;
  stroke-width: 1.3;
}
</style>
