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
    expect(TOOLS.map((tool) => [tool.id, tool.seedInit().layout])).toEqual([
      ['frame', 'none'],
      ['flex', 'flex'],
      ['grid', 'grid'],
    ])
  })

  it('gives the frames that arrange children something to arrange', () => {
    // An empty flex frame looks exactly like an empty plain one, so the
    // tool would give no sign it had done anything at all.
    expect(TOOLS.map((tool) => [tool.id, tool.seedChildren().length])).toEqual([
      ['frame', 0],
      ['flex', 2],
      ['grid', 4],
    ])
  })

  it('seeds every child filling both axes', () => {
    // Not a nicety: both axes default to `fixed`, and a fixed axis with no
    // number renders as auto — which collapses an empty frame to nothing.
    // A seeded child without this would be invisible.
    const children = TOOLS.flatMap((tool) => tool.seedChildren())

    expect(children).not.toHaveLength(0)
    for (const child of children) {
      expect(child).toMatchObject({ widthMode: 'fill', heightMode: 'fill' })
    }
  })

  it('gives a grid tracks both ways, so its children land as a square', () => {
    // Without these a grid is a single column, which is a flex column with
    // extra steps — and the four children below would stack.
    const grid = TOOLS.find((tool) => tool.id === 'grid')!

    expect(grid.seedInit().styles).toMatchObject({
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)',
    })
  })

  it('seeds a gap on the frames that arrange children, and only those', () => {
    const gapOf = (id: string) => {
      const styles = TOOLS.find((tool) => tool.id === id)!.seedInit().styles ?? {}
      return { ...styles }
    }

    // Flex takes the shorthand; a grid sets its two axes separately.
    expect(gapOf('flex')).toMatchObject({ gap: '10px' })
    expect(gapOf('grid')).toMatchObject({ columnGap: '10px', rowGap: '10px' })
    // A frame with no layout has no gap to speak of, and the inspector
    // hides the row — seeding one would be an invisible style.
    expect(gapOf('frame')).toEqual({})
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

    // Same for the children, and one level deeper: the array is rebuilt,
    // and so is every entry in it.
    const flex = TOOLS.find((tool) => tool.id === 'flex')!
    expect(flex.seedChildren()).not.toBe(flex.seedChildren())
    expect(flex.seedChildren()[0]).not.toBe(flex.seedChildren()[0])
    // And the two siblings from one call are not the same object either.
    const [first, second] = flex.seedChildren()
    expect(first).not.toBe(second)
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
