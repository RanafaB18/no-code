<script setup lang="ts">
import { useTheme, type ThemePreference } from '@/composables/useTheme'

const { preference } = useTheme()

const options: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]
</script>

<template>
  <!--
    Native radios rather than buttons with role="radio": the browser
    gives us correct arrow-key navigation and a single tab stop for the
    group for free. A custom implementation would need roving tabindex
    to match, which is easy to get subtly wrong.

    The inputs are visually hidden but never display:none, so they stay
    focusable and keyboard-reachable.
  -->
  <fieldset class="theme-toggle">
    <legend class="visually-hidden">Theme</legend>

    <label
      v-for="option in options"
      :key="option.value"
      class="theme-toggle__option"
      :class="{ 'theme-toggle__option--active': preference === option.value }"
    >
      <input
        v-model="preference"
        type="radio"
        name="theme-preference"
        :value="option.value"
        class="visually-hidden"
      />
      <span>{{ option.label }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  gap: 0.25rem;
  margin: 0;
  padding: 0.25rem;
  background-color: var(--color-surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.theme-toggle__option {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-fg-muted);
  border-radius: 0.375rem;
  cursor: pointer;
}

.theme-toggle__option:hover {
  color: var(--color-fg-default);
}

.theme-toggle__option--active {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent);
}

.theme-toggle__option--active:hover {
  color: var(--color-fg-on-accent);
  background-color: var(--color-accent-hover);
}

/* The input is visually hidden, so surface its focus ring on the label. */
.theme-toggle__option:has(input:focus-visible) {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}
</style>
