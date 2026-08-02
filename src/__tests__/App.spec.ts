import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  it('mounts the builder surface, tools and inspector', () => {
    const wrapper = mount(App)

    expect(wrapper.find('.workspace').exists()).toBe(true)
    expect(wrapper.find('.toolbar__button').exists()).toBe(true)
    expect(wrapper.text()).toContain('Inspector')
  })

  it('keeps the theme toggle available alongside the builder', () => {
    const wrapper = mount(App)

    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(3)
  })
})
