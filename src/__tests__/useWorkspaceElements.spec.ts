import { beforeEach, describe, expect, it } from 'vitest'

import { useWorkspaceElements } from '../composables/useWorkspaceElements'

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
})
