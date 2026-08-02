import { beforeEach, describe, expect, it } from 'vitest'

import {
  findElement,
  useWorkspaceElements,
  walkElements,
} from '../composables/useWorkspaceElements'

const { elements, selectedId, selectedElement, addElement, select, updateStyle } =
  useWorkspaceElements()

// State is a module-level singleton, so it survives between tests in
// this file and has to be reset explicitly.
beforeEach(() => {
  elements.value.splice(0)
  select(null)
})

describe('useWorkspaceElements', () => {
  it('appends new elements to the end of the flow', () => {
    const first = addElement('div', { width: '100px' })
    const second = addElement('div', { width: '200px' })

    expect(elements.value.map((element) => element.id)).toEqual([first.id, second.id])
  })

  it('gives each element a distinct id', () => {
    expect(addElement('div').id).not.toBe(addElement('div').id)
  })

  it('exposes the selected element, and null when nothing is selected', () => {
    const element = addElement('div', { width: '120px' })

    expect(selectedElement.value).toBeNull()

    select(element.id)
    expect(selectedId.value).toBe(element.id)
    expect(selectedElement.value?.styles.width).toBe('120px')

    select(null)
    expect(selectedElement.value).toBeNull()
  })

  it('updates styles on the addressed element only', () => {
    const first = addElement('div')
    const second = addElement('div')

    updateStyle(first.id, 'padding', '1rem')

    expect(first.styles.padding).toBe('1rem')
    expect(second.styles.padding).toBeUndefined()
  })

  it('treats an empty value as clearing a property', () => {
    const element = addElement('div', { padding: '1rem' })

    updateStyle(element.id, 'padding', '')

    expect(element.styles.padding).toBe('')
  })

  it('ignores updates for an unknown id rather than throwing', () => {
    expect(() => updateStyle('does-not-exist', 'padding', '1rem')).not.toThrow()
  })

  it('gives every element an empty children array', () => {
    expect(addElement('div').children).toEqual([])
  })

  it('nests into a parent rather than growing the root', () => {
    const parent = addElement('div')
    const child = addElement('div', {}, parent.id)

    expect(elements.value).toHaveLength(1)
    expect(parent.children).toEqual([child])
  })

  it('finds and edits elements at any depth', () => {
    const root = addElement('div')
    const middle = addElement('div', {}, root.id)
    const leaf = addElement('div', { width: '10px' }, middle.id)

    // Compared by id, not identity: `addElement` hands back the raw
    // object while reads through the reactive array yield a proxy of it.
    // Same underlying element, different reference.
    expect(findElement(leaf.id)?.id).toBe(leaf.id)

    select(leaf.id)
    expect(selectedElement.value?.id).toBe(leaf.id)

    updateStyle(leaf.id, 'padding', '1rem')
    expect(leaf.styles.padding).toBe('1rem')
    expect(middle.styles.padding).toBeUndefined()
    expect(root.styles.padding).toBeUndefined()
  })

  it('falls back to the root for an unknown parent rather than throwing', () => {
    const orphan = addElement('div', {}, 'does-not-exist')

    expect(elements.value.map((element) => element.id)).toContain(orphan.id)
  })

  it('walks the tree depth-first, parents before children', () => {
    const first = addElement('div')
    const nested = addElement('div', {}, first.id)
    const second = addElement('div')

    expect([...walkElements(elements.value)]).toEqual([first, nested, second])
  })
})
