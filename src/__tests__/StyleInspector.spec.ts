import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import StyleInspector from '../components/StyleInspector.vue'
import { propertiesFor } from '../composables/styleSchema'
import { useCanvasNodes } from '../composables/useCanvasNodes'

const { addNode, selectNode, resetDocument } = useCanvasNodes()

beforeEach(() => {
  resetDocument()
  selectNode(null)
  localStorage.clear()
})

describe('Inspector', () => {
  it('prompts for a selection when nothing is selected', () => {
    const wrapper = mount(StyleInspector)

    expect(wrapper.text()).toContain('Select an element')
    expect(wrapper.findAll('.field')).toHaveLength(0)
  })

  it('renders one field per schema entry for the selected element', async () => {
    const node = addNode('div')
    selectNode(node.id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    expect(wrapper.findAll('.field')).toHaveLength(propertiesFor(node).length)
    for (const property of propertiesFor(node)) {
      expect(wrapper.find(`#field-${property.key}`).exists()).toBe(true)
    }
  })

  it('writes a typed value onto the selected element', async () => {
    const element = addNode('div')
    selectNode(element.id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    await wrapper.get('#field-padding').setValue('1rem')

    expect(element.styles.padding).toBe('1rem')
  })

  it('writes node fields to the node, not into styles', async () => {
    const element = addNode('div')
    selectNode(element.id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    await wrapper.get('#field-layout').setValue('grid')
    await wrapper.get('#field-width').setValue('320')
    await wrapper.get('#field-overflow').setValue('auto')

    // Layout and geometry are first-class fields the canvas reads
    // directly; writing them into `styles` would put them where nothing
    // looks, which is the bug this routing exists to prevent.
    expect(element.layout).toBe('grid')
    expect(element.width).toBe(320)
    expect(element.styles.layout).toBeUndefined()
    expect(element.styles.width).toBeUndefined()

    // Genuine CSS still goes to styles.
    expect(element.styles.overflow).toBe('auto')
  })

  it('writes a chosen option from a select field', async () => {
    const element = addNode('div')
    selectNode(element.id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    await wrapper.get('#field-borderStyle').setValue('dashed')

    expect(element.styles.borderStyle).toBe('dashed')
  })

  it('clears a property back to unset', async () => {
    const element = addNode('div', { styles: { padding: '2rem' } })
    selectNode(element.id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    const clear = wrapper.get('[aria-label="Clear Padding"]')
    expect(clear.attributes('disabled')).toBeUndefined()

    await clear.trigger('click')

    expect(element.styles.padding).toBe('')
  })

  it('disables the clear button while a property is unset', async () => {
    selectNode(addNode('div').id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    expect(wrapper.get('[aria-label="Clear Padding"]').attributes('disabled')).toBeDefined()
  })

  it('offers no orientation control', () => {
    const wrapper = mount(StyleInspector)

    expect(wrapper.find('.inspector__orientation').exists()).toBe(false)
  })

  it('does not persist its position', async () => {
    mount(StyleInspector, { attachTo: document.body })
    await nextTick()

    expect(localStorage.getItem('panel:inspector')).toBeNull()
  })
})
