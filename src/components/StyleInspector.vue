<script setup lang="ts">
import DraggablePanel from '@/components/DraggablePanel.vue'
import { STYLE_PROPERTIES } from '@/composables/styleSchema'
import { anchorRightMiddle } from '@/composables/useDraggablePanel'
import { useCanvasNodes } from '@/composables/useCanvasNodes'

const { selectedNode, updateStyle } = useCanvasNodes()

/**
 * `<input type="color">` has no empty state — given '' it falls back to
 * black, which would show a colour the element doesn't actually have.
 * The swatch shows this while the property is unset, and the row's clear
 * button is the way back to "not set".
 */
const UNSET_COLOR = '#000000'

function setStyle(key: string, value: string) {
  const node = selectedNode.value
  if (!node) return
  updateStyle(node.id, key, value)
}

function handleInput(key: string, event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
    setStyle(key, target.value)
  }
}
</script>

<template>
  <DraggablePanel class="inspector" :anchor="anchorRightMiddle" aria-label="Element styles">
    <template #handle>
      <span class="inspector__grip" aria-hidden="true">⠿</span>
      <h2 class="inspector__title">Inspector</h2>
    </template>

    <p v-if="!selectedNode" class="inspector__empty">Select an element to edit its styles.</p>

    <template v-else>
      <p class="inspector__type">&lt;{{ selectedNode.type }}&gt;</p>

      <!-- Rendered from STYLE_PROPERTIES, so adding an editable property
           is one entry in the schema rather than a change here. -->
      <div class="inspector__fields">
        <div v-for="property in STYLE_PROPERTIES" :key="property.key" class="field">
          <label class="field__label" :for="`field-${property.key}`">{{ property.label }}</label>

          <div class="field__controls">
            <select
              v-if="property.input === 'select'"
              :id="`field-${property.key}`"
              class="field__input"
              :value="selectedNode.styles[property.key] ?? ''"
              @change="handleInput(property.key, $event)"
            >
              <option value="">—</option>
              <option v-for="option in property.options" :key="option" :value="option">
                {{ option }}
              </option>
            </select>

            <input
              v-else-if="property.input === 'color'"
              :id="`field-${property.key}`"
              type="color"
              class="field__input field__input--color"
              :value="selectedNode.styles[property.key] || UNSET_COLOR"
              @input="handleInput(property.key, $event)"
            />

            <input
              v-else
              :id="`field-${property.key}`"
              type="text"
              class="field__input"
              :placeholder="property.placeholder"
              :value="selectedNode.styles[property.key] ?? ''"
              @input="handleInput(property.key, $event)"
            />

            <button
              type="button"
              class="field__clear"
              :disabled="!selectedNode.styles[property.key]"
              :aria-label="`Clear ${property.label}`"
              title="Clear"
              @click="setStyle(property.key, '')"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </template>
  </DraggablePanel>
</template>

<style scoped>
/* Positioning, surface and handle chrome all come from DraggablePanel;
   only the inspector's own layout and fields are here. */
.inspector {
  width: 16rem;
  max-height: 100vh;
  padding: 0.75rem;
  overflow-y: auto;
}

.inspector :deep(.panel__handle) {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 0.75rem;
}

.inspector__grip {
  color: var(--color-fg-subtle);
}

.inspector__title {
  font-size: 0.875rem;
  font-weight: 600;
}

.inspector__empty {
  font-size: 0.8125rem;
  color: var(--color-fg-muted);
}

.inspector__type {
  margin-bottom: 0.625rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-fg-subtle);
}

.inspector__fields {
  display: grid;
  gap: 0.625rem;
}

.field__label {
  display: block;
  margin-bottom: 0.1875rem;
  font-size: 0.75rem;
  color: var(--color-fg-muted);
}

.field__controls {
  display: flex;
  gap: 0.25rem;
}

.field__input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-fg-default);
  background-color: var(--color-surface);
  /* border-strong, not border: this marks the bounds of an interactive
     control, so it needs the 3:1 non-text contrast token. */
  border: 1px solid var(--color-border-strong);
  border-radius: 0.25rem;
}

.field__input--color {
  padding: 0.125rem;
  block-size: 1.75rem;
}

.field__clear {
  padding: 0 0.375rem;
  font-size: 0.875rem;
  line-height: 1;
  color: var(--color-fg-muted);
  background-color: transparent;
  border: 1px solid var(--color-border-strong);
  border-radius: 0.25rem;
  cursor: pointer;
}

.field__clear:hover:not(:disabled) {
  color: var(--color-fg-on-danger);
  background-color: var(--color-danger);
  border-color: var(--color-danger);
}

.field__clear:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
