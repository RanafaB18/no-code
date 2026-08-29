import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import StyleInspector from '../components/StyleInspector.vue'
import { propertiesFor, sectionsFor } from '../composables/styleSchema'
import { useCanvasNodes } from '../composables/useCanvasNodes'

const { addNode, selectNode, resetDocument } = useCanvasNodes()

/**
 * Mounts with a node selected, and reveals an optional property if asked.
 *
 * Optional properties are hidden until they hold a value or are picked
 * from their section's `+` menu, so a test touching one has to open it
 * the way a user would.
 */
async function mountWith(node: { id: string }, reveal?: string) {
  selectNode(node.id)
  const wrapper = mount(StyleInspector)
  await nextTick()

  if (reveal) {
    // The picker that actually offers it — each section has its own.
    const picker = wrapper
      .findAll('.group__add')
      .find((select) => select.find(`option[value="${reveal}"]`).exists())
    await picker!.setValue(reveal)
  }
  return wrapper
}

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

  it('renders every applicable property that is not optional', async () => {
    const node = addNode('div')
    const wrapper = await mountWith(node)

    const expected = propertiesFor(node).filter((property) => !property.optional)
    expect(wrapper.findAll('.field')).toHaveLength(expected.length)
    for (const property of expected) {
      expect(wrapper.find(`#field-${property.key}`).exists()).toBe(true)
    }
  })

  it('groups the properties into sections, in schema order', async () => {
    const node = addNode('div')
    const wrapper = await mountWith(node)

    // The chevron shares the button, so match on the label it carries.
    const headings = wrapper.findAll('.group__toggle')
    expect(headings).toHaveLength(sectionsFor(node).length)
    sectionsFor(node).forEach((section, index) => {
      expect(headings[index]!.text()).toContain(section.label)
    })
  })

  it('collapses a section without losing what is in it', async () => {
    const node = addNode('div')
    const wrapper = await mountWith(node)

    const toggle = wrapper.findAll('.group__toggle')[0]!
    expect(toggle.attributes('aria-expanded')).toBe('true')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')

    // v-show, not v-if: collapsing is a view state, and re-creating every
    // control would drop focus and any half-typed value along with it.
    expect(wrapper.find('#field-layout').exists()).toBe(true)
  })

  it('hides an optional property until it is asked for', async () => {
    const node = addNode('div')
    const wrapper = await mountWith(node)

    // An always-visible empty box for something most frames never set
    // costs more attention than it saves.
    expect(wrapper.find('#field-padding').exists()).toBe(false)
    expect(wrapper.find('.group__add option[value="padding"]').exists()).toBe(true)

    const revealed = await mountWith(node, 'padding')
    expect(revealed.find('#field-padding').exists()).toBe(true)
  })

  it('shows an optional property that already has a value', async () => {
    const node = addNode('div', { styles: { padding: '2rem' } })
    const wrapper = await mountWith(node)

    // Set means visible — otherwise a value would be in effect with no
    // control anywhere to see or undo it.
    expect(wrapper.find('#field-padding').exists()).toBe(true)
    expect(wrapper.find('.group__add option[value="padding"]').exists()).toBe(false)
  })

  it('writes a typed value onto the selected element', async () => {
    const element = addNode('div')
    const wrapper = await mountWith(element, 'padding')

    await wrapper.get('#field-padding').setValue('1rem')

    expect(element.styles.padding).toBe('1rem')
  })

  it('writes node fields to the node, not into styles', async () => {
    const element = addNode('div')
    const wrapper = await mountWith(element, 'overflow')

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
    const wrapper = await mountWith(element, 'borderStyle')

    await wrapper.get('#field-borderStyle').setValue('dashed')

    expect(element.styles.borderStyle).toBe('dashed')
  })

  it('clears a property back to unset', async () => {
    const element = addNode('div', { styles: { padding: '2rem' } })
    const wrapper = await mountWith(element)

    const clear = wrapper.get('[aria-label="Clear Padding"]')
    expect(clear.attributes('disabled')).toBeUndefined()

    await clear.trigger('click')

    expect(element.styles.padding).toBe('')
  })

  it('disables the clear button while a property is unset', async () => {
    const wrapper = await mountWith(addNode('div'), 'padding')

    expect(wrapper.get('[aria-label="Clear Padding"]').attributes('disabled')).toBeDefined()
  })

  describe('aspect lock', () => {
    it('is offered only for a node that states both sizes in pixels', async () => {
      const sized = await mountWith(addNode('div', { width: 300, height: 200 }))
      expect(sized.find('#field-aspectRatio').exists()).toBe(true)

      // A `fit` axis is decided by the contents, so there is no number
      // here to scale and no shape to hold.
      const fitted = await mountWith(addNode('div', { width: 300, heightMode: 'fit' }))
      expect(fitted.find('#field-aspectRatio').exists()).toBe(false)
    })

    it('carries the other axis when a size is typed', async () => {
      const node = addNode('div', { width: 300, height: 200 })
      const wrapper = await mountWith(node)

      await wrapper.get('#field-aspectRatio').trigger('click')
      await wrapper.get('#field-width').setValue('600')

      expect(node.height).toBe(400)

      // And the other way round, off the same captured ratio.
      await wrapper.get('#field-height').setValue('100')
      expect(node.width).toBe(150)
    })

    it('leaves the other axis alone while unlocked', async () => {
      const node = addNode('div', { width: 300, height: 200 })
      const wrapper = await mountWith(node)

      await wrapper.get('#field-width').setValue('600')

      expect(node.height).toBe(200)
    })
  })

  describe('corner radius', () => {
    it('splits one value into four, seeded from what was showing', async () => {
      const node = addNode('div', { styles: { borderRadius: '12px' } })
      const wrapper = await mountWith(node)

      await wrapper.get('.radius__mode').trigger('click')

      // The shorthand goes as the longhands arrive: with both in the style
      // map, which one wins would come down to insertion order.
      expect(node.styles.borderRadius).toBe('')
      expect(node.styles.borderTopLeftRadius).toBe('12px')
      expect(node.styles.borderBottomRightRadius).toBe('12px')
    })

    it('opens per-corner mode with a value even from nothing', async () => {
      const node = addNode('div')
      const wrapper = await mountWith(node, 'borderRadius')

      await wrapper.get('.radius__mode').trigger('click')
      await nextTick()

      // The mode is derived from the corners, so four blanks would flip
      // straight back to one field.
      expect(node.styles.borderTopLeftRadius).toBe('0')
      expect(wrapper.find('#field-borderTopLeftRadius').exists()).toBe(true)
    })

    it('merges back to the first corner', async () => {
      const node = addNode('div', {
        styles: { borderTopLeftRadius: '4px', borderBottomRightRadius: '20px' },
      })
      const wrapper = await mountWith(node)

      await wrapper.get('.radius__mode').trigger('click')

      expect(node.styles.borderRadius).toBe('4px')
      expect(node.styles.borderBottomRightRadius).toBe('')
    })

    it('counts a per-corner radius as the row having a value', async () => {
      const node = addNode('div', { styles: { borderTopLeftRadius: '4px' } })
      const wrapper = await mountWith(node)

      // Shown without being asked for — otherwise a radius would be in
      // effect with no control anywhere to undo it.
      expect(wrapper.find('#field-borderTopLeftRadius').exists()).toBe(true)
      expect(wrapper.find('.group__add option[value="borderRadius"]').exists()).toBe(false)
    })
  })

  describe('grid controls', () => {
    /**
     * Which of these fields the inspector offers for a node.
     *
     * One node at a time, deliberately: every mounted inspector reads the
     * same module-level selection, so holding two wrappers open and
     * comparing them afterwards would only ever show the last selection
     * twice.
     */
    async function fieldsFor(node: { id: string }, keys: readonly string[]) {
      const wrapper = await mountWith(node)
      const shown = keys.filter((key) => wrapper.find(`#field-${key}`).exists())
      wrapper.unmount()
      return shown
    }

    const LAYOUT_KEYS = [
      'gridTemplateColumns',
      'gridTemplateRows',
      'columnGap',
      'rowGap',
      'flexDirection',
      'gap',
    ] as const

    it('offers a grid its tracks and a gap per axis', async () => {
      expect(await fieldsFor(addNode('div', { layout: 'grid' }), LAYOUT_KEYS)).toEqual([
        'gridTemplateColumns',
        'gridTemplateRows',
        'columnGap',
        'rowGap',
      ])
    })

    it('offers flex its direction and a single gap', async () => {
      // `flex-direction` does nothing to a grid, and a grid's gap is the
      // pair above — offering either there would be a control the browser
      // ignores.
      expect(await fieldsFor(addNode('div', { layout: 'flex' }), LAYOUT_KEYS)).toEqual([
        'flexDirection',
        'gap',
      ])
    })

    it('offers a frame that arranges nothing neither', async () => {
      expect(await fieldsFor(addNode('div', { layout: 'none' }), LAYOUT_KEYS)).toEqual([])
    })

    it('offers alignment to both, since both honour it', async () => {
      const keys = ['justifyContent', 'alignItems'] as const

      expect(await fieldsFor(addNode('div', { layout: 'grid' }), keys)).toEqual([...keys])
      expect(await fieldsFor(addNode('div', { layout: 'flex' }), keys)).toEqual([...keys])
    })

    const SPAN_KEYS = ['gridColumn', 'gridRow'] as const

    it('shows a flex frame the direction CSS is already giving it', async () => {
      // The tools never write `flex-direction`, so the picker sat at "—"
      // while the browser was laying the frame out as a row regardless.
      const wrapper = await mountWith(addNode('div', { layout: 'flex' }))

      expect(wrapper.get<HTMLSelectElement>('#field-flexDirection').element.value).toBe('row')
    })

    it('still counts that direction as unset', async () => {
      // Display only: nothing is stored until the field is actually
      // touched, so Clear has nothing to clear.
      const node = addNode('div', { layout: 'flex' })
      const wrapper = await mountWith(node)

      expect(node.styles.flexDirection).toBeUndefined()
      const clear = wrapper.get('[aria-label="Clear Direction"]')
      expect(clear.attributes('disabled')).toBeDefined()
    })

    it('offers span to a frame its parent lays out on a grid', async () => {
      const grid = addNode('div', { layout: 'grid' })

      expect(await fieldsFor(addNode('div', {}, grid.id), SPAN_KEYS)).toEqual([...SPAN_KEYS])
    })

    it('offers no span inside a flex frame, where there are no cells', async () => {
      const flex = addNode('div', { layout: 'flex' })

      expect(await fieldsFor(addNode('div', {}, flex.id), SPAN_KEYS)).toEqual([])
    })

    it('does not offer a grid its own span — that is its parent’s business', async () => {
      // A grid frame sets how many cells exist; spanning them is what the
      // frames inside it do.
      expect(await fieldsFor(addNode('div', { layout: 'grid' }), SPAN_KEYS)).toEqual([])
    })
  })

  it('keeps keystrokes in its fields away from the canvas', () => {
    // The boundary used to come from the floating panel wrapper. It is
    // what stops Backspace in a width field deleting the selected element
    // instead of a character — see `useCanvasShortcuts`.
    const wrapper = mount(StyleInspector)

    expect(wrapper.find('.inspector[data-shortcut-boundary]').exists()).toBe(true)
  })
})
