<script setup lang="ts">
import { useTemplateRef } from 'vue'

/**
 * The pill button shared by every toolbar tool.
 *
 * Extracted rather than left as duplicated class names across the
 * components that render tools: Vue's `scoped` attribute only reaches a
 * child component's root element, never elements nested inside it. Two
 * components separately writing `class="toolbar__button"` looked
 * identical in the markup but silently compiled to two different scope
 * hashes, so only one of them ever actually received the CSS.
 *
 * Extra attributes (title, aria-expanded, aria-controls, ...) fall
 * through onto the root <button> automatically — this component has a
 * single root element and does not declare them as props.
 */
defineProps<{
  label: string
  shortcut: string
  active: boolean
}>()

defineEmits<{ click: [] }>()

const root = useTemplateRef<HTMLButtonElement>('root')

defineExpose({ focus: () => root.value?.focus() })
</script>

<template>
  <button
    ref="root"
    type="button"
    class="toolbar__button"
    :class="{ 'toolbar__button--active': active }"
    :aria-pressed="active"
    :aria-keyshortcuts="shortcut"
    @click="$emit('click')"
  >
    <span>{{ label }}</span><sub class="toolbar__shortcut">{{ shortcut }}</sub>
  </button>
</template>

<style scoped>
.toolbar__button {
  position: relative;
  display: inline-flex;
  align-items: center;
  /* Extra right padding keeps the label clear of the corner shortcut. */
  padding: 0.375rem 0.9rem 0.375rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-fg-muted);
  background-color: transparent;
  border-radius: 0.375rem;
  cursor: pointer;
}

.toolbar__button:hover {
  color: var(--color-fg-default);
}

.toolbar__button--active {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
}

.toolbar__button--active:hover {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent-hover);
}

/* Tucked into the button's bottom-right corner rather than trailing the
   label, so it reads as an annotation on the tool instead of part of its
   name. Absolutely positioned, so <sub>'s own baseline shift is moot. */
.toolbar__shortcut {
  position: absolute;
  right: 0.3rem;
  bottom: 0.15rem;
  font-size: 0.5625rem;
  line-height: 1;
  opacity: 0.6;
}
</style>
