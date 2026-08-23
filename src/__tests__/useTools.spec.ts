import { beforeEach, describe, expect, it } from 'vitest'

import { TOOLS, useTools } from '../composables/useTools'
import { ELEMENT_TYPES } from '../composables/useCanvasNodes'
import { LAYOUT_VALUES, toStyleBinding, STYLE_PROPERTIES } from '../composables/styleSchema'

const { activeToolId, activeTool, arm, disarm, toggle } = useTools()

beforeEach(() => {
  disarm()
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

  it('seeds each tool with its own fixed layout', () => {
    expect(TOOLS.map((tool) => [tool.id, tool.seedInit()])).toEqual([
      ['frame', { layout: 'none' }],
      ['flex', { layout: 'flex' }],
      ['grid', { layout: 'grid' }],
    ])
  })

  it('offers a tool for every layout a frame can have', () => {
    // Otherwise a layout would be reachable only by drawing something else
    // and changing it afterwards in the inspector.
    const seeded = TOOLS.map((tool) => tool.seedInit().layout)

    expect(new Set(seeded)).toEqual(new Set(LAYOUT_VALUES))
  })

  it('hands out a fresh seed each time, never a shared object', () => {
    // Two nodes drawn with one tool must not end up sharing fields.
    expect(TOOLS[0]?.seedInit()).not.toBe(TOOLS[0]?.seedInit())
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
