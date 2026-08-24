import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import NumberStepper from '../components/NumberStepper.vue'

function mountStepper(value: number, min?: number) {
  return mount(NumberStepper, {
    props: { value, id: 'field-columns', unit: 'column', ...(min === undefined ? {} : { min }) },
  })
}

/** The last value the stepper asked its parent to store. */
function emitted(wrapper: ReturnType<typeof mountStepper>) {
  const updates = wrapper.emitted('update')
  return updates?.[updates.length - 1]?.[0]
}

describe('NumberStepper', () => {
  it('steps up and down by one', async () => {
    const wrapper = mountStepper(2)

    await wrapper.get('[aria-label="Add a column"]').trigger('click')
    expect(emitted(wrapper)).toBe(3)

    await wrapper.get('[aria-label="Remove a column"]').trigger('click')
    expect(emitted(wrapper)).toBe(1)
  })

  it('stops at the minimum rather than going below it', async () => {
    const wrapper = mountStepper(1)

    // Disabled, not silently ignored — a button that looks live and does
    // nothing is worse than one that says it cannot.
    expect(wrapper.get('[aria-label="Remove a column"]').attributes('disabled')).toBeDefined()
  })

  it('clamps a typed value that is below the minimum', async () => {
    const wrapper = mountStepper(3)

    await wrapper.get('input').setValue('0')

    expect(emitted(wrapper)).toBe(1)
  })

  it('rounds a typed fraction to a whole count', async () => {
    const wrapper = mountStepper(2)

    await wrapper.get('input').setValue('3.6')

    expect(emitted(wrapper)).toBe(4)
  })

  it('says nothing while the field is empty or half-typed', async () => {
    // Snapping a cleared field straight to the minimum would fight anyone
    // clearing it in order to type a different number.
    const wrapper = mountStepper(2)

    await wrapper.get('input').setValue('')
    await wrapper.get('input').setValue('-')

    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('names its buttons after what they add, not the glyph on them', () => {
    // "minus" says nothing about what is being taken away.
    const wrapper = mount(NumberStepper, {
      props: { value: 2, id: 'field-rows', unit: 'row' },
    })

    expect(wrapper.find('[aria-label="Add a row"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="Remove a row"]').exists()).toBe(true)
  })

  it('honours a minimum other than one', async () => {
    const wrapper = mountStepper(0, 0)

    expect(wrapper.get('[aria-label="Remove a column"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[aria-label="Add a column"]').trigger('click')
    expect(emitted(wrapper)).toBe(1)
  })
})
