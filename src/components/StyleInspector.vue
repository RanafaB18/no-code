<script setup lang="ts">
import DraggablePanel from '@/components/DraggablePanel.vue'
import { propertiesFor, type StyleProperty } from '@/composables/styleSchema'
import { anchorRightMiddle } from '@/composables/useDraggablePanel'
import {
  useCanvasNodes,
  type CanvasNode,
  type NodeLayout,
  type NodePosition,
} from '@/composables/useCanvasNodes'

const { selectedNode, updateStyle, updateGeometry, updateLayout, updatePosition } =
  useCanvasNodes()

/**
 * `<input type="color">` has no empty state — given '' it falls back to
 * black, which would show a colour the node doesn't actually have.
 */
const UNSET_COLOR = '#000000'

/** Reads a property from wherever it lives. */
function valueOf(node: CanvasNode, property: StyleProperty): string {
  if (property.source === 'style') return node.styles[property.key] ?? ''
  const raw = node[property.key as keyof CanvasNode]
  return raw === undefined || raw === null ? '' : String(raw)
}

/**
 * Writes a property back to wherever it lives.
 *
 * Geometry, layout and position are first-class fields the canvas reads
 * directly — writing them into `styles` would put them somewhere nothing
 * looks, which is exactly the bug this routing exists to prevent.
 */
function setValue(property: StyleProperty, value: string) {
  const node = selectedNode.value
  if (!node) return

  if (property.source === 'style') {
    updateStyle(node.id, property.key, value)
    return
  }

  if (property.key === 'layout') {
    updateLayout(node.id, value as NodeLayout)
    return
  }

  if (property.key === 'position') {
    updatePosition(node.id, (value || 'auto') as NodePosition)
    return
  }

  // Geometry. An empty field clears the pin rather than writing 0 —
  // "unset" and "zero" are different, and conflating them would silently
  // move an element to the origin.
  const numeric = value === '' ? undefined : Number(value)
  if (numeric !== undefined && !Number.isFinite(numeric)) return
  updateGeometry(node.id, { [property.key]: numeric })
}

function handleInput(property: StyleProperty, event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
    setValue(property, target.value)
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
        <div v-for="property in propertiesFor(selectedNode)" :key="property.key" class="field">
          <label class="field__label" :for="`field-${property.key}`">{{ property.label }}</label>

          <div class="field__controls">
            <select
              v-if="property.input === 'select'"
              :id="`field-${property.key}`"
              class="field__input"
              :value="valueOf(selectedNode, property)"
              @change="handleInput(property, $event)"
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
              :value="valueOf(selectedNode, property) || UNSET_COLOR"
              @input="handleInput(property, $event)"
            />

            <input
              v-else
              :id="`field-${property.key}`"
              type="text"
              class="field__input"
              :placeholder="property.placeholder"
              :value="valueOf(selectedNode, property)"
              @input="handleInput(property, $event)"
            />

            <button
              type="button"
              class="field__clear"
              :disabled="!valueOf(selectedNode, property)"
              :aria-label="`Clear ${property.label}`"
              title="Clear"
              @click="setValue(property, '')"
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
