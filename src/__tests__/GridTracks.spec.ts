import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import GridSpan from '../components/GridSpan.vue'
import GridTracks from '../components/GridTracks.vue'
import { getNode, useCanvasNodes, type CanvasNode } from '../composables/useCanvasNodes'

const { addNode, resetDocument } = useCanvasNodes()

function mountTracks(node: CanvasNode) {
  return mount(GridTracks, { props: { node, id: 'field-gridTracks' } })
}

function mountSpan(node: CanvasNode) {
  return mount(GridSpan, { props: { node, id: 'field-gridSpan' } })
}

beforeEach(resetDocument)

describe('GridTracks', () => {
  it('reads the count out of the template it wrote', () => {
    const grid = addNode('div', {
      layout: 'grid',
      styles: { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(5, 1fr)' },
    })

    const wrapper = mountTracks(grid)
    expect(wrapper.get<HTMLInputElement>('#field-gridTemplateColumns').element.value).toBe('3')
    expect(wrapper.get<HTMLInputElement>('#field-gridTemplateRows').element.value).toBe('5')
  })

  it('reads a grid with no template at all as a single track', () => {
    const wrapper = mountTracks(addNode('div', { layout: 'grid' }))

    expect(wrapper.get<HTMLInputElement>('#field-gridTemplateColumns').element.value).toBe('1')
  })

  it('reads a template it did not write as a single track', () => {
    // Uneven tracks are outside what a count can say. Reading 1 is a
    // deliberate surrender rather than a guess — and this widget is the
    // only writer today, so nothing produces this in practice.
    const grid = addNode('div', {
      layout: 'grid',
      styles: { gridTemplateColumns: '2fr 1fr' },
    })

    expect(mountTracks(grid).get<HTMLInputElement>('#field-gridTemplateColumns').element.value).toBe(
      '1',
    )
  })

  it('writes the count back as an even template', async () => {
    const grid = addNode('div', { layout: 'grid' })
    const wrapper = mountTracks(grid)

    await wrapper.get('#field-gridTemplateColumns ~ [aria-label="Add a column"]').trigger('click')

    expect(getNode(grid.id)?.styles.gridTemplateColumns).toBe('repeat(2, 1fr)')
  })

  it('touches only the axis being stepped', async () => {
    const grid = addNode('div', {
      layout: 'grid',
      styles: { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' },
    })
    const wrapper = mountTracks(grid)

    await wrapper.get('#field-gridTemplateRows ~ [aria-label="Add a row"]').trigger('click')

    expect(getNode(grid.id)?.styles.gridTemplateRows).toBe('repeat(3, 1fr)')
    expect(getNode(grid.id)?.styles.gridTemplateColumns).toBe('repeat(2, 1fr)')
  })
})

describe('GridSpan', () => {
  it('reads an unset span as one cell', () => {
    const wrapper = mountSpan(addNode('div', {}))

    expect(wrapper.get<HTMLInputElement>('#field-gridColumn').element.value).toBe('1')
    expect(wrapper.get<HTMLInputElement>('#field-gridRow').element.value).toBe('1')
  })

  it('reads the span it wrote', () => {
    const child = addNode('div', { styles: { gridColumn: 'span 2' } })

    expect(mountSpan(child).get<HTMLInputElement>('#field-gridColumn').element.value).toBe('2')
  })

  it('writes a span of more than one', async () => {
    const child = addNode('div', {})
    const wrapper = mountSpan(child)

    await wrapper.get('#field-gridColumn ~ [aria-label="Add a column"]').trigger('click')

    expect(getNode(child.id)?.styles.gridColumn).toBe('span 2')
  })

  it('clears the style rather than writing a span of one', async () => {
    // One cell is what a frame does unasked, and '' is how the inspector
    // spells unset — so this keeps inert entries out of the styles map.
    const child = addNode('div', { styles: { gridColumn: 'span 2' } })
    const wrapper = mountSpan(child)

    await wrapper.get('#field-gridColumn ~ [aria-label="Remove a column"]').trigger('click')

    expect(getNode(child.id)?.styles.gridColumn).toBe('')
  })
})
