import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import ToolMenu from '../components/ToolMenu.vue'
import { TOOLS, useTools } from '../composables/useTools'

const { activeToolId, arm, disarm } = useTools()

// Attached to the document, because focus assertions need a real
// document.activeElement to move between.
function mountMenu() {
  return mount(ToolMenu, { attachTo: document.body })
}

function openMenu(wrapper: ReturnType<typeof mountMenu>) {
  return wrapper.get('.tool-menu__trigger').trigger('click')
}

beforeEach(() => {
  disarm()
})

describe('ToolMenu', () => {
  it('lists every registered tool with its shortcut', async () => {
    const wrapper = mountMenu()
    await openMenu(wrapper)

    const items = wrapper.findAll('[role="menuitemradio"]')
    expect(items).toHaveLength(TOOLS.length)
    expect(items.map((item) => item.text())).toEqual(
      TOOLS.map((tool) => `${tool.label}${tool.shortcut}`),
    )
  })

  it('starts closed', () => {
    const wrapper = mountMenu()

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(wrapper.get('.tool-menu__trigger').attributes('aria-expanded')).toBe('false')
  })

  it('opens from the trigger even while a tool is armed', async () => {
    // The trigger is not itself a tool: it never arms, and never disarms
    // to get out of the way of opening.
    arm('flex')
    const wrapper = mountMenu()
    await openMenu(wrapper)

    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    expect(activeToolId.value).toBe('flex')
  })

  it('arms the chosen tool and closes', async () => {
    const wrapper = mountMenu()
    await openMenu(wrapper)

    await wrapper.findAll('[role="menuitemradio"]')[1]!.trigger('click')

    expect(activeToolId.value).toBe('flex')
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })

  it('disarms when the armed tool is chosen again', async () => {
    // The only way out of draw mode from here: the top bar is a shortcut
    // boundary, so Escape typed in it never reaches the global handler.
    arm('grid')
    const wrapper = mountMenu()
    await openMenu(wrapper)

    await wrapper.findAll('[role="menuitemradio"]')[2]!.trigger('click')

    expect(activeToolId.value).toBeNull()
  })

  it('marks the armed tool, however it was armed', async () => {
    arm('grid')
    const wrapper = mountMenu()
    await openMenu(wrapper)

    const checked = wrapper
      .findAll('[role="menuitemradio"]')
      .filter((item) => item.attributes('aria-checked') === 'true')

    expect(checked.map((item) => item.text())).toEqual(['Grid3'])
  })

  it('shows on the trigger that a tool is armed', () => {
    // Digit shortcuts arm without opening the menu, so this is the only
    // chrome that says the next drag will draw.
    arm('frame')
    const wrapper = mountMenu()

    const trigger = wrapper.get('.tool-menu__trigger')
    expect(trigger.classes()).toContain('tool-menu__trigger--armed')
    expect(trigger.attributes('aria-label')).toContain('Frame')
  })

  it('moves focus with the arrow keys without arming anything', async () => {
    // The regression test for choosing `menuitemradio` over native radios:
    // radios select as you arrow onto them, which here would arm a tool
    // and slam the menu shut on the first keypress.
    const wrapper = mountMenu()
    await openMenu(wrapper)

    const items = wrapper.findAll('[role="menuitemradio"]')
    expect(document.activeElement).toBe(items[0]!.element)

    await items[0]!.trigger('keydown', { key: 'ArrowDown' })

    expect(document.activeElement).toBe(items[1]!.element)
    expect(activeToolId.value).toBeNull()
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
  })

  it('wraps around the ends of the list', async () => {
    const wrapper = mountMenu()
    await openMenu(wrapper)

    const items = wrapper.findAll('[role="menuitemradio"]')
    await items[0]!.trigger('keydown', { key: 'ArrowUp' })

    expect(document.activeElement).toBe(items[items.length - 1]!.element)
  })

  it('closes on Escape and hands focus back to the trigger', async () => {
    const wrapper = mountMenu()
    await openMenu(wrapper)

    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.tool-menu__trigger').element)
    expect(activeToolId.value).toBeNull()
  })

  it('closes again when the trigger is pressed a second time', async () => {
    const wrapper = mountMenu()
    await openMenu(wrapper)
    await openMenu(wrapper)

    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  })
})
