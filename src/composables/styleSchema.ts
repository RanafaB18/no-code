import {
  isViewport,
  resolvedPosition,
  type CanvasNode,
  type NodeLayout,
  type NodePosition,
} from './useCanvasNodes'

/**
 * The properties the inspector can edit.
 *
 * A registry, not a hardcoded form: StyleInspector renders itself by
 * iterating this, so adding a property here is the only change needed to
 * gain a control for it. Same posture as `THEMES` and `TOOLS` — extend
 * the array, don't refactor the consumer.
 */

/**
 * Which form input the user is given.
 *
 * Says nothing about what it writes — several properties share one input.
 *
 *   'number'  numeric field, for geometry
 *   'length'  free-text CSS length ('12px', '1rem', 'auto')
 *   'color'   native colour picker
 *   'select'  dropdown constrained to the property's `options`
 */
export type StyleInputType = 'number' | 'length' | 'color' | 'select'

/**
 * Where a value lives.
 *
 * `node` writes a first-class field — geometry, layout, position — which
 * the canvas manipulates directly and which must never be a CSS string.
 * `style` writes into the node's `styles` map.
 */
export type PropertySource = 'node' | 'style'

export interface StyleProperty {
  /** For `style`, the camelCase CSS property. For `node`, the field name. */
  key: string
  label: string
  input: StyleInputType
  source: PropertySource
  /** Only meaningful for `input: 'select'`. */
  options?: readonly string[]
  placeholder?: string
  /**
   * Hides a property that would be inert in the node's current context —
   * offsets under a parent that positions its own children, or flex
   * options on a frame with no layout. Showing a value the browser
   * ignores is worse than showing nothing.
   */
  appliesTo?: (node: CanvasNode) => boolean
}

export const LAYOUT_VALUES = ['none', 'flex', 'grid'] as const satisfies readonly NodeLayout[]

export const POSITION_VALUES = ['auto', 'absolute'] as const satisfies readonly NodePosition[]

/** True when the node positions itself, so its offsets actually apply. */
function isPositioned(node: CanvasNode) {
  return resolvedPosition(node) === 'absolute'
}

/** True when the node arranges its own children, so flex/grid options apply. */
function laysOutChildren(node: CanvasNode) {
  return node.layout !== 'none'
}

export const STYLE_PROPERTIES: readonly StyleProperty[] = [
  // Layout — how this frame arranges its children.
  { key: 'layout', label: 'Layout', input: 'select', source: 'node', options: LAYOUT_VALUES },
  {
    key: 'flexDirection',
    label: 'Direction',
    input: 'select',
    source: 'style',
    options: ['row', 'column'],
    appliesTo: laysOutChildren,
  },
  { key: 'gap', label: 'Gap', input: 'length', source: 'style', appliesTo: laysOutChildren },
  {
    key: 'justifyContent',
    label: 'Justify',
    input: 'select',
    source: 'style',
    options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
    appliesTo: laysOutChildren,
  },
  {
    key: 'alignItems',
    label: 'Align',
    input: 'select',
    source: 'style',
    options: ['stretch', 'flex-start', 'center', 'flex-end'],
    appliesTo: laysOutChildren,
  },

  // Position — how this frame places itself. Offsets are hidden when a
  // parent lays it out, since it is then placed by the parent and the
  // values would do nothing.
  {
    key: 'position',
    label: 'Type',
    input: 'select',
    source: 'node',
    options: POSITION_VALUES,
    // The viewport is the coordinate origin — there is nothing above it to
    // position against — so `updatePosition` refuses it. Offering the
    // control anyway would be offering one that silently does nothing.
    appliesTo: (node) => !isViewport(node.id),
  },
  { key: 'left', label: 'Left', input: 'number', source: 'node', appliesTo: isPositioned },
  { key: 'top', label: 'Top', input: 'number', source: 'node', appliesTo: isPositioned },

  // Size — geometry, never CSS strings.
  { key: 'width', label: 'Width', input: 'number', source: 'node' },
  { key: 'height', label: 'Height', input: 'number', source: 'node' },

  // Appearance.
  { key: 'padding', label: 'Padding', input: 'length', source: 'style', placeholder: '0' },
  { key: 'backgroundColor', label: 'Background', input: 'color', source: 'style' },
  { key: 'borderWidth', label: 'Border width', input: 'length', source: 'style', placeholder: '0' },
  {
    key: 'borderStyle',
    label: 'Border style',
    input: 'select',
    source: 'style',
    options: ['none', 'solid', 'dashed', 'dotted'],
  },
  { key: 'borderColor', label: 'Border color', input: 'color', source: 'style' },
  { key: 'borderRadius', label: 'Radius', input: 'length', source: 'style', placeholder: '0' },

  /**
   * `overflow` defaults to `visible`, so a child that outgrows its parent
   * spills out and paints over whatever is beneath. This is the only
   * property that clips, or produces a scrollbar.
   *
   * `clip` is a real CSS value, not a friendly name for `hidden`: both
   * clip, but `hidden` still makes the box a scroll container that can be
   * scrolled programmatically, while `clip` creates none at all.
   */
  {
    key: 'overflow',
    label: 'Overflow',
    input: 'select',
    source: 'style',
    options: ['visible', 'hidden', 'clip', 'scroll', 'auto'],
  },
]

/** The properties that apply to a node, in schema order. */
export function propertiesFor(node: CanvasNode): readonly StyleProperty[] {
  return STYLE_PROPERTIES.filter((property) => property.appliesTo?.(node) ?? true)
}

/**
 * Strips unset values before the styles reach a `:style` binding.
 *
 * The inspector writes '' to mean "not set"; passing that through would
 * emit an empty declaration rather than leaving the property alone.
 *
 * Tested against '' specifically rather than falsiness: a zero is a
 * legitimate value the user may have typed, and while the string '0' is
 * truthy today, a bare `Boolean` check would start silently discarding
 * zeroes the moment this map ever holds numbers.
 */
export function toStyleBinding(styles: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(styles).filter(([, value]) => value !== ''))
}
