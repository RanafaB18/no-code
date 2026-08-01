import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import ThemeToggle from '../components/ThemeToggle.vue'

describe('ThemeToggle', () => {
  it('pins an explicit theme via a root class and persists it', async () => {
    const wrapper = mount(ThemeToggle)
    const root = document.documentElement

    await wrapper.get('input[value="dark"]').setValue()
    await nextTick()

    expect(root.classList.contains('theme-dark')).toBe(true)
    expect(root.classList.contains('theme-light')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('dark')

    await wrapper.get('input[value="light"]').setValue()
    await nextTick()

    expect(root.classList.contains('theme-light')).toBe(true)
    expect(root.classList.contains('theme-dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('clears the override so the OS preference applies again', async () => {
    const wrapper = mount(ThemeToggle)
    const root = document.documentElement

    await wrapper.get('input[value="dark"]').setValue()
    await nextTick()
    await wrapper.get('input[value="system"]').setValue()
    await nextTick()

    // No class at all is what lets `color-scheme: light dark` defer to
    // prefers-color-scheme.
    expect(root.classList.contains('theme-dark')).toBe(false)
    expect(root.classList.contains('theme-light')).toBe(false)
    expect(localStorage.getItem('theme')).toBeNull()
  })

  it('labels the group for assistive tech', () => {
    const wrapper = mount(ThemeToggle)

    expect(wrapper.get('legend').text()).toBe('Theme')
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(3)
  })
})
