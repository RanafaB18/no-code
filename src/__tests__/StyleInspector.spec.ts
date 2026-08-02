import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import StyleInspector from '../components/StyleInspector.vue'
import { STYLE_PROPERTIES } from '../composables/styleSchema'
import { useWorkspaceElements } from '../composables/useWorkspaceElements'

const { elements, addElement, select } = useWorkspaceElements()

beforeEach(() => {
  elements.value.splice(0)
  select(null)
  localStorage.clear()
})

describe('Inspector', () => {
  it('prompts for a selection when nothing is selected', () => {
    const wrapper = mount(StyleInspector)

    expect(wrapper.text()).toContain('Select an element')
    expect(wrapper.findAll('.field')).toHaveLength(0)
  })

  it('renders one field per schema entry for the selected element', async () => {
    select(addElement('div').id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    expect(wrapper.findAll('.field')).toHaveLength(STYLE_PROPERTIES.length)
    for (const property of STYLE_PROPERTIES) {
      expect(wrapper.find(`#field-${property.key}`).exists()).toBe(true)
    }
  })

  it('writes a typed value onto the selected element', async () => {
    const element = addElement('div')
    select(element.id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    await wrapper.get('#field-padding').setValue('1rem')

    expect(element.styles.padding).toBe('1rem')
  })

  it('writes the layout properties the Frame tool introduced', async () => {
    const element = addElement('div')
    select(element.id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    await wrapper.get('#field-display').setValue('grid')
    await wrapper.get('#field-overflow').setValue('auto')
    await wrapper.get('#field-flexShrink').setValue('0')

    expect(element.styles.display).toBe('grid')
    expect(element.styles.overflow).toBe('auto')
    expect(element.styles.flexShrink).toBe('0')
  })

  it('writes a chosen option from a select field', async () => {
    const element = addElement('div')
    select(element.id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    await wrapper.get('#field-borderStyle').setValue('dashed')

    expect(element.styles.borderStyle).toBe('dashed')
  })

  it('clears a property back to unset', async () => {
    const element = addElement('div', { padding: '2rem' })
    select(element.id)
    const wrapper = mount(StyleInspector)
    await nextTick()

    const clear = wrapper.get('[aria-label="Clear Padding"]')
    expect(clear.attributes('disabled')).toBeUndefined()

    await clear.trigger('click')

    expect(element.styles.padding).toBe('')
  })

  it('disables the clear button while a property is unset', async () => {
    select(addElement('div').id)
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
