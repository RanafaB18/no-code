import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import BuilderToolbar from '../components/BuilderToolbar.vue'
import { TOOLS, useTools } from '../composables/useTools'

const { activeToolId, disarm } = useTools()

beforeEach(() => {
  disarm()
  localStorage.clear()
})

describe('Toolbar', () => {
  it('renders one button per registered tool', () => {
    const wrapper = mount(BuilderToolbar)

    const labels = wrapper.findAll('.toolbar__button').map((button) => button.text())
    expect(labels).toHaveLength(TOOLS.length)
    for (const tool of TOOLS) {
      expect(labels.join(' ')).toContain(tool.label)
    }
  })

  it('shows each shortcut as a subscript on its tool', () => {
    const wrapper = mount(BuilderToolbar)

    const shortcut = wrapper.get('.toolbar__button sub')
    expect(shortcut.text()).toBe(TOOLS[0]?.shortcut)
  })

  it('toggles the tool on and off, reflecting state in aria-pressed', async () => {
    const wrapper = mount(BuilderToolbar)
    const button = wrapper.get('.toolbar__button')

    expect(button.attributes('aria-pressed')).toBe('false')

    await button.trigger('click')
    expect(activeToolId.value).toBe('div')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.classes()).toContain('toolbar__button--active')

    await button.trigger('click')
    expect(activeToolId.value).toBeNull()
    expect(button.attributes('aria-pressed')).toBe('false')
  })

  it('switches orientation', async () => {
    const wrapper = mount(BuilderToolbar)
    expect(wrapper.classes()).toContain('toolbar--horizontal')

    await wrapper.get('.toolbar__orientation').trigger('click')
    await nextTick()

    expect(wrapper.classes()).toContain('toolbar--vertical')
  })

  it('does not persist its placement', async () => {
    const wrapper = mount(BuilderToolbar, { attachTo: document.body })
    await nextTick()

    await wrapper.get('.toolbar__orientation').trigger('click')
    await nextTick()

    expect(localStorage.getItem('panel:toolbar')).toBeNull()
  })

  it('moves when the handle is dragged', async () => {
    const wrapper = mount(BuilderToolbar, { attachTo: document.body })
    // VueUse binds its listeners from a post-flush watcher, so they are
    // not live until a tick after mount. Dispatching before this tick
    // silently hits nothing.
    await nextTick()

    const before = wrapper.attributes('style')

    // Proves the panel/handle template refs are actually bound — without
    // them useDraggable has nothing to attach to and the panel is inert.
    //
    // pointerType matters: useDraggable filters on it (default
    // ['mouse','touch','pen']) and a PointerEvent built without one
    // reports '', which the filter rejects.
    wrapper.get('.panel__handle').element.dispatchEvent(
      new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
      }),
    )
    await nextTick()
    // Dragging state belongs to DraggablePanel now, not the toolbar.
    expect(wrapper.classes()).toContain('panel--dragging')

    window.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 260,
        clientY: 300,
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
      }),
    )
    await nextTick()

    expect(wrapper.attributes('style')).not.toBe(before)
  })
})
