import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  it('mounts the builder surface, tools and inspector', () => {
    const wrapper = mount(App)

    expect(wrapper.find('.workspace').exists()).toBe(true)
    expect(wrapper.find('.tool-menu__trigger').exists()).toBe(true)
    expect(wrapper.text()).toContain('Inspector')
  })

  it('docks a rail either side of the canvas', () => {
    const wrapper = mount(App)

    // The canvas is a cell between the rails now, not the whole window,
    // which is what `toWorkspacePoint` and `workspaceSize` exist to
    // account for. A wrapper is required around it, so the zoom controls
    // can float over the canvas without being inside it.
    expect(wrapper.find('.shell__canvas .workspace').exists()).toBe(true)
    expect(wrapper.find('.rail--left').exists()).toBe(true)
    expect(wrapper.find('.rail--right').exists()).toBe(true)
  })

  it('keeps every piece of docked chrome out of the canvas shortcuts', () => {
    // Backspace typed in any of these belongs to the control with focus.
    const wrapper = mount(App)

    for (const selector of ['.topbar', '.rail--left', '.rail--right', '.zoom-controls']) {
      expect(wrapper.find(`${selector}[data-shortcut-boundary]`).exists()).toBe(true)
    }
  })

  it('keeps the theme toggle available alongside the builder', () => {
    const wrapper = mount(App)

    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(3)
  })
})
