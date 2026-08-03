import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import FrameToolControl from '../components/FrameToolControl.vue'
import { LAYOUT_VALUES } from '../composables/styleSchema'
import { DEFAULT_FRAME_LAYOUT, frameLayout } from '../composables/useFrameTool'
import { TOOLS, useTools } from '../composables/useTools'

const { activeToolId, disarm } = useTools()
const tool = TOOLS[0]

function mountControl(orientation: 'horizontal' | 'vertical' = 'horizontal') {
  return mount(FrameToolControl, {
    props: { tool, orientation },
    attachTo: document.body,
  })
}

beforeEach(() => {
  disarm()
  frameLayout.value = DEFAULT_FRAME_LAYOUT
})

describe('FrameToolControl', () => {
  it('arms and disarms the tool from the single button', async () => {
    const wrapper = mountControl()
    const button = wrapper.get('.toolbar__button')

    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.get('sub').text()).toBe(tool.shortcut)

    await button.trigger('click')
    expect(activeToolId.value).toBe('frame')
    expect(button.attributes('aria-pressed')).toBe('true')

    await button.trigger('click')
    expect(activeToolId.value).toBeNull()
  })

  it('reveals the display menu only while armed — arming and opening are the same action', async () => {
    const wrapper = mountControl()
    const button = wrapper.get('.toolbar__button')

    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.frame-tool__menu').exists()).toBe(false)

    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.frame-tool__menu').exists()).toBe(true)

    await button.trigger('click')
    expect(wrapper.find('.frame-tool__menu').exists()).toBe(false)
  })

  it('offers every display value, with the current one checked', async () => {
    frameLayout.value = 'grid'
    const wrapper = mountControl()

    await wrapper.get('.toolbar__button').trigger('click')

    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(LAYOUT_VALUES.length)
    expect(wrapper.get('input:checked').attributes('value')).toBe('grid')
  })

  it('focuses the checked radio when arming reveals the menu', async () => {
    const wrapper = mountControl()

    await wrapper.get('.toolbar__button').trigger('click')
    await nextTick()

    // Load-bearing: useCanvasShortcuts ignores keydown from inside a
    // data-shortcut-boundary, which the toolbar panel carries, so focus
    // being inside the menu is what stops a stray digit from re-arming
    // behind the menu's back. It also means Escape needs its own local
    // handler — see below.
    expect(document.activeElement?.tagName).toBe('INPUT')
  })

  it('choosing a display closes the menu but keeps the tool armed', async () => {
    const wrapper = mountControl()
    await wrapper.get('.toolbar__button').trigger('click')

    await wrapper.get('input[value="flex"]').setValue()
    await nextTick()

    expect(frameLayout.value).toBe('flex')
    // Closes because the choice reads as "done"; stays armed so the
    // newly chosen display is ready to draw with immediately.
    expect(wrapper.find('.frame-tool__menu').exists()).toBe(false)
    expect(activeToolId.value).toBe('frame')
  })

  it('reopens the menu on disarming and re-arming, after a prior choice closed it', async () => {
    const wrapper = mountControl()
    const button = wrapper.get('.toolbar__button')

    await button.trigger('click')
    await wrapper.get('input[value="flex"]').setValue()
    expect(wrapper.find('.frame-tool__menu').exists()).toBe(false)

    await button.trigger('click') // disarm
    await button.trigger('click') // re-arm

    expect(wrapper.find('.frame-tool__menu').exists()).toBe(true)
  })

  it('Escape disarms the tool and closes the menu', async () => {
    const wrapper = mountControl()
    await wrapper.get('.toolbar__button').trigger('click')

    await wrapper.get('.frame-tool__menu').trigger('keydown.esc')

    expect(activeToolId.value).toBeNull()
    expect(wrapper.find('.frame-tool__menu').exists()).toBe(false)
  })

  it('returns focus to the button after Escape', async () => {
    const wrapper = mountControl()
    await wrapper.get('.toolbar__button').trigger('click')

    await wrapper.get('.frame-tool__menu').trigger('keydown.esc')

    expect(document.activeElement).toBe(wrapper.get('.toolbar__button').element)
  })

  it('carries its orientation so the menu can open on the right edge', () => {
    expect(mountControl('horizontal').classes()).toContain('frame-tool--horizontal')
    expect(mountControl('vertical').classes()).toContain('frame-tool--vertical')
  })
})
