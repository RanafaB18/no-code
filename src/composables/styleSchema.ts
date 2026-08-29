import {
  getNode,
  resolvedPosition,
  type CanvasNode,
  type NodeLayout,
  type NodePosition,
  type SizeMode,
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
 *
 * The rest are **widgets**: they hold no single value, so they render
 * their own control and write through directly rather than going through
 * the shared field row.
 *
 *   'pins'        the constraint widget — which edges are anchored
 *   'size-pair'   Width and Height together, plus the ratio lock between them
 *   'corners'     border radius, uniform or per corner
 *   'grid-tracks' how many columns and rows a grid frame has
 *   'grid-span'   how many of its parent's cells a frame covers
 */
export type StyleInputType =
  | 'number'
  | 'length'
  | 'color'
  | 'select'
  | 'pins'
  | 'size-pair'
  | 'corners'
  | 'grid-tracks'
  | 'grid-span'

const WIDGET_INPUTS: readonly StyleInputType[] = [
  'pins',
  'size-pair',
  'corners',
  'grid-tracks',
  'grid-span',
]

/**
 * True for a property with no single field behind it.
 *
 * Everything that reads or writes "the value" — the clear button, the
 * "is it set?" test that decides whether an optional row is shown — has to
 * stand aside for these and let the widget answer instead.
 */
export function isWidget(property: StyleProperty): boolean {
  return WIDGET_INPUTS.includes(property.input)
}

/**
 * Where a value lives.
 *
 * `node` writes a first-class field — geometry, layout, position — which
 * the canvas manipulates directly and which must never be a CSS string.
 * `style` writes into the node's `styles` map.
 */
export type PropertySource = 'node' | 'style'

/**
 * A value that may depend on the node being edited.
 *
 * Some properties cannot be described statically: `fill` is only a real
 * choice for a node its parent lays out, and a size field's unit depends
 * on the mode chosen above it. Resolving per node keeps that knowledge in
 * the schema rather than spreading it through the inspector's template.
 */
export type Dynamic<T> = T | ((node: CanvasNode) => T)

export function resolveDynamic<T>(value: Dynamic<T>, node: CanvasNode): T {
  return typeof value === 'function' ? (value as (node: CanvasNode) => T)(node) : value
}

/**
 * The inspector's groups, in panel order.
 *
 * A flat list of twenty-odd controls is unreadable, and the grouping is
 * not cosmetic: `layout` is what this frame does to its children, while
 * `position` and `size` are what happens to the frame itself. Keeping
 * that boundary visible is most of what makes the panel legible.
 */
export const SECTIONS = [
  { id: 'layout', label: 'Layout' },
  { id: 'position', label: 'Position' },
  { id: 'size', label: 'Size' },
  { id: 'appearance', label: 'Appearance' },
] as const

export type SectionId = (typeof SECTIONS)[number]['id']

export interface StyleProperty {
  /** For `style`, the camelCase CSS property. For `node`, the field name. */
  key: string
  label: string
  section: SectionId
  /**
   * Hidden until it has a value, or until it is picked from the section's
   * `+` menu. For properties most frames never set — borders, radius,
   * overflow — where an always-visible empty box costs more attention
   * than it saves.
   */
  optional?: boolean
  input: StyleInputType
  source: PropertySource
  /** Only meaningful for `input: 'select'`. */
  options?: Dynamic<readonly string[]>
  placeholder?: Dynamic<string>
  /**
   * What an unset value reads as, when CSS itself already has an opinion.
   *
   * Only for a `select` — a length or colour has no meaningful browser
   * default to stand in for. `flexDirection` is the case this exists for:
   * CSS defaults to `row` whether the style is there or not, so showing
   * the picker at "—" was never true of what was on screen, only of what
   * happened to be written down.
   *
   * Display only, and read through a dedicated helper rather than
   * `valueOf` — `isSet` and the Clear button both read `valueOf` directly
   * and must keep seeing nothing stored, or Clear would sit enabled for a
   * value there is nothing to clear, and an optional property with this
   * set would show as set when no one had touched it.
   */
  default?: Dynamic<string>
  /**
   * Hides a property that would be inert in the node's current context —
   * offsets under a parent that positions its own children, or flex
   * options on a frame with no layout. Showing a value the browser
   * ignores is worse than showing nothing.
   */
  appliesTo?: (node: CanvasNode) => boolean
  /**
   * Whether a widget property holds a value, which decides whether an
   * optional row stays visible once it has one. Only widgets need it —
   * everything else is answered by reading `key`.
   */
  hasValue?: (node: CanvasNode) => boolean
}

/**
 * The corners of a border radius, in CSS's own order.
 *
 * Listed once here rather than in the widget, because the schema also has
 * to know them: a radius set per corner still counts as the `Radius` row
 * holding a value, and that row's key is the uniform property.
 */
export const UNIFORM_RADIUS_KEY = 'borderRadius'

export const RADIUS_CORNERS = [
  { key: 'borderTopLeftRadius', label: 'Top left' },
  { key: 'borderTopRightRadius', label: 'Top right' },
  { key: 'borderBottomRightRadius', label: 'Bottom right' },
  { key: 'borderBottomLeftRadius', label: 'Bottom left' },
] as const

/** Set means non-empty: '' is how the inspector spells "unset". */
export function isStyleSet(node: CanvasNode, key: string): boolean {
  return (node.styles[key] ?? '') !== ''
}

export const LAYOUT_VALUES = ['none', 'flex', 'grid'] as const satisfies readonly NodeLayout[]

export const POSITION_VALUES = ['auto', 'absolute'] as const satisfies readonly NodePosition[]

/** True when the node positions itself, so its offsets actually apply. */
function isPositioned(node: CanvasNode) {
  return resolvedPosition(node) === 'absolute'
}

/**
 * True when the node has a real parent to position against.
 *
 * Only the viewport lacks one today, and it changes what "Position" even
 * means: a parentless node has no resizable container to anchor to or
 * stretch with, so it gets a plain X/Y instead of the type selector and
 * constraint widget a parented node uses.
 */
function hasParent(node: CanvasNode) {
  return node.parentId !== null
}

/** True when the node arranges its own children, so flex/grid options apply. */
function laysOutChildren(node: CanvasNode) {
  return node.layout !== 'none'
}

/**
 * The two layouts, separately — several options belong to one and are
 * inert in the other.
 *
 * `flex-direction` does nothing to a grid, and the single `gap` is
 * replaced there by a pair, one per axis. Offering either anyway would
 * put a control in the panel the browser ignores.
 */
function laysOutFlex(node: CanvasNode) {
  return node.layout === 'flex'
}

function laysOutGrid(node: CanvasNode) {
  return node.layout === 'grid'
}

/**
 * True when this node's *parent* lays it out on a grid.
 *
 * The only predicate here that looks upward, and it has to: spanning
 * cells is something a frame can only do inside a grid, so the control
 * for it depends on a fact the node itself does not hold.
 */
function inGrid(node: CanvasNode) {
  return getNode(node.parentId)?.layout === 'grid'
}

export const SIZE_MODES = [
  'fixed',
  'relative',
  'fill',
  'fit',
] as const satisfies readonly SizeMode[]

/**
 * The size modes a node can actually use.
 *
 * `fill` is dropped for a node that positions itself: it is `flex-grow`
 * or `stretch` underneath, and neither reaches a box its parent has
 * stopped laying out. Such a node fills by pinning both edges instead —
 * the constraint widget, not this control.
 */
export function sizeModesFor(node: CanvasNode): readonly string[] {
  if (resolvedPosition(node) === 'relative') return SIZE_MODES
  return SIZE_MODES.filter((mode) => mode !== 'fill')
}

export const STYLE_PROPERTIES: readonly StyleProperty[] = [
  // Layout — how this frame arranges its children.
  {
    key: 'layout',
    section: 'layout',
    label: 'Layout',
    input: 'select',
    source: 'node',
    options: LAYOUT_VALUES,
  },
  {
    key: 'gridTracks',
    section: 'layout',
    // No label: the widget draws its own Columns and Rows rows, which sit
    // flush with the rest of the section rather than indented under a
    // heading for them.
    label: '',
    input: 'grid-tracks',
    source: 'style',
    appliesTo: laysOutGrid,
  },
  {
    key: 'flexDirection',
    section: 'layout',
    label: 'Direction',
    input: 'select',
    source: 'style',
    options: ['row', 'column'],
    appliesTo: laysOutFlex,
    // The tools never write this — see `ToolIcon.vue` — so it reads as
    // unset on every flex frame drawn, even though CSS is already
    // rendering it as `row`.
    default: 'row',
  },
  {
    key: 'gap',
    section: 'layout',
    label: 'Gap',
    input: 'length',
    source: 'style',
    appliesTo: laysOutFlex,
  },
  // A grid gets one per axis where flex gets a single shorthand — the two
  // directions are genuinely separate decisions on a grid.
  {
    key: 'columnGap',
    section: 'layout',
    label: 'Gap X',
    input: 'length',
    source: 'style',
    appliesTo: laysOutGrid,
  },
  {
    key: 'rowGap',
    section: 'layout',
    label: 'Gap Y',
    input: 'length',
    source: 'style',
    appliesTo: laysOutGrid,
  },
  {
    key: 'justifyContent',
    section: 'layout',
    label: 'Justify',
    input: 'select',
    source: 'style',
    options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around'],
    appliesTo: laysOutChildren,
  },
  {
    key: 'alignItems',
    section: 'layout',
    label: 'Align',
    input: 'select',
    source: 'style',
    options: ['stretch', 'flex-start', 'center', 'flex-end'],
    appliesTo: laysOutChildren,
  },

  // Position — three different shapes, chosen by the node itself rather
  // than any one flag. A parentless node (only the viewport today) has
  // no resizable container to position against, so it gets a plain X/Y —
  // reusing the `left`/`top` fields directly, under different labels,
  // rather than inventing aliases that would need their own read/write
  // path. A parented node gets the type selector, and — only once it
  // positions itself — the constraint widget, which now carries its own
  // numeric fields internally; there is nothing left to list beside it.
  {
    key: 'left',
    section: 'position',
    label: 'X',
    input: 'number',
    source: 'node',
    appliesTo: (node) => !hasParent(node),
  },
  {
    key: 'top',
    section: 'position',
    label: 'Y',
    input: 'number',
    source: 'node',
    appliesTo: (node) => !hasParent(node),
  },
  {
    key: 'position',
    section: 'position',
    label: 'Type',
    input: 'select',
    source: 'node',
    options: POSITION_VALUES,
    appliesTo: hasParent,
  },
  {
    key: 'pins',
    section: 'position',
    label: 'Constraints',
    input: 'pins',
    source: 'node',
    appliesTo: (node) => hasParent(node) && isPositioned(node),
  },

  // Size — Width and Height together, one row each, plus the ratio lock
  // between them. One entry rather than five: the widget owns both axes'
  // writes itself, including the locked-ratio counterpart.
  // Above Width and Height, because inside a grid it is the coarser
  // answer to the same question: how many cells first, how big within
  // them second.
  {
    key: 'gridSpan',
    section: 'size',
    // No label, as with the tracks widget — it draws its own rows.
    label: '',
    input: 'grid-span',
    source: 'style',
    appliesTo: inGrid,
  },
  {
    key: 'size',
    section: 'size',
    label: 'Size',
    input: 'size-pair',
    source: 'node',
  },

  // Appearance.
  {
    key: 'padding',
    section: 'appearance',
    optional: true,
    label: 'Padding',
    input: 'length',
    source: 'style',
    placeholder: '0',
  },
  {
    key: 'backgroundColor',
    section: 'appearance',
    optional: true,
    label: 'Background',
    input: 'color',
    source: 'style',
  },
  {
    key: 'borderWidth',
    section: 'appearance',
    optional: true,
    label: 'Border width',
    input: 'length',
    source: 'style',
    placeholder: '0',
  },
  {
    key: 'borderStyle',
    section: 'appearance',
    optional: true,
    label: 'Border style',
    input: 'select',
    source: 'style',
    options: ['none', 'solid', 'dashed', 'dotted'],
  },
  {
    key: 'borderColor',
    section: 'appearance',
    optional: true,
    label: 'Border color',
    input: 'color',
    source: 'style',
  },
  // One row for five properties: the widget writes either the shorthand or
  // the four corners, never both, so the row counts as set when any of
  // them holds a value.
  {
    key: UNIFORM_RADIUS_KEY,
    section: 'appearance',
    optional: true,
    label: 'Radius',
    input: 'corners',
    source: 'style',
    hasValue: (node) =>
      isStyleSet(node, UNIFORM_RADIUS_KEY) ||
      RADIUS_CORNERS.some((corner) => isStyleSet(node, corner.key)),
  },

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
    section: 'appearance',
    optional: true,
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

export interface PropertySection {
  id: SectionId
  label: string
  properties: readonly StyleProperty[]
}

/**
 * The applicable properties, grouped.
 *
 * Sections with nothing in them are dropped rather than rendered empty —
 * a frame with no layout has no flex options to offer, and a heading over
 * a void reads as something failing to load.
 */
export function sectionsFor(node: CanvasNode): readonly PropertySection[] {
  const applicable = propertiesFor(node)
  return SECTIONS.map((section) => ({
    ...section,
    properties: applicable.filter((property) => property.section === section.id),
  })).filter((section) => section.properties.length > 0)
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
