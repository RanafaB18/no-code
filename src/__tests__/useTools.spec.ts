import { beforeEach, describe, expect, it } from 'vitest'

import { TOOLS, useTools } from '../composables/useTools'
import { DEFAULT_FRAME_LAYOUT, frameLayout } from '../composables/useFrameTool'
import { ELEMENT_TYPES } from '../composables/useCanvasNodes'
import { toStyleBinding, STYLE_PROPERTIES } from '../composables/styleSchema'

const { activeToolId, activeTool, arm, disarm, toggle } = useTools()

beforeEach(() => {
  disarm()
  frameLayout.value = DEFAULT_FRAME_LAYOUT
})

describe('useTools', () => {
  it('starts idle, which is select mode', () => {
    expect(activeToolId.value).toBeNull()
    expect(activeTool.value).toBeNull()
  })

  it('arms and disarms a tool', () => {
    arm('frame')
    expect(activeToolId.value).toBe('frame')
    expect(activeTool.value?.label).toBe('Frame')

    disarm()
    expect(activeToolId.value).toBeNull()
  })

  it('toggles the same tool back off', () => {
    toggle('frame')
    expect(activeToolId.value).toBe('frame')

    toggle('frame')
    expect(activeToolId.value).toBeNull()
  })

  it('only creates element types the workspace knows about', () => {
    for (const tool of TOOLS) {
      expect(ELEMENT_TYPES).toContain(tool.creates)
    }
  })

  it('seeds the layout the frame tool currently has selected', () => {
    frameLayout.value = 'grid'
    expect(TOOLS[0]?.seedInit()).toEqual({ layout: 'grid' })

    frameLayout.value = DEFAULT_FRAME_LAYOUT
    expect(TOOLS[0]?.seedInit()).toEqual({ layout: DEFAULT_FRAME_LAYOUT })
  })

  it('gives every tool a unique id and shortcut', () => {
    const ids = TOOLS.map((tool) => tool.id)
    const shortcuts = TOOLS.map((tool) => tool.shortcut)

    expect(new Set(ids).size).toBe(TOOLS.length)
    expect(new Set(shortcuts).size).toBe(TOOLS.length)
  })
})

describe('styleSchema', () => {
  it('gives every property a unique key', () => {
    const keys = STYLE_PROPERTIES.map((property) => property.key)
    expect(new Set(keys).size).toBe(STYLE_PROPERTIES.length)
  })

  it('gives every select property its options', () => {
    const missingOptions = STYLE_PROPERTIES.filter(
      (property) => property.input === 'select' && !property.options?.length,
    )

    expect(missingOptions).toEqual([])
  })

  it('drops unset properties from the style binding', () => {
    expect(toStyleBinding({ width: '10px', padding: '' })).toEqual({ width: '10px' })
  })

  it('keeps zero values, which are meaningful CSS', () => {
    expect(toStyleBinding({ padding: '0', margin: '0px' })).toEqual({
      padding: '0',
      margin: '0px',
    })
  })
})
