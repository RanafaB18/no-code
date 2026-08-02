/**
 * The CSS properties the inspector can edit.
 *
 * This is a registry, not a hardcoded form: Inspector.vue renders itself
 * by iterating STYLE_PROPERTIES, so adding a property here is the only
 * change needed to gain a control for it. Same posture as `THEMES` in
 * useTheme.ts and `TOOLS` in useTools.ts — extend the array, don't
 * refactor the consumer.
 */

/**
 * Which form input the user is given to type a value into.
 *
 * This decides the widget only — it says nothing about the CSS produced,
 * so several properties share one input type: `padding`, `margin` and
 * `borderRadius` are all edited through `'length'`.
 *
 *   'length'  free-text field for a CSS length ('12px', '1rem', 'auto')
 *   'color'   native colour picker (<input type="color">)
 *   'select'  dropdown constrained to the property's `options`
 *
 * Supporting a new widget (a slider, a box-model spacing editor) means
 * adding a member here and a matching branch in Inspector.vue. It's a
 * named union rather than an inline one so those two places can
 * reference the same type and can't drift apart.
 */
export type StyleInputType = 'length' | 'color' | 'select'

export interface StyleProperty {
  /** camelCase CSS property — the form Vue's `:style` binding expects. */
  key: string
  label: string
  /** The widget the inspector renders to edit this property. */
  input: StyleInputType
  /** Only meaningful for `input: 'select'`. */
  options?: readonly string[]
  /** Shown as the input's placeholder to hint the expected format. */
  placeholder?: string
}

/**
 * The `display` values the Frame tool offers and the inspector can set.
 *
 * Owned here rather than by the tool so the toolbar dropdown and the
 * inspector field cannot drift apart — both read this one array.
 *
 * `none` is deliberately absent: it would make an element both
 * unselectable and unmeasurable, breaking the selection overlay. Adding
 * it would need a guard in the workspace's `measureRect`.
 */
export const DISPLAY_VALUES = ['block', 'flex', 'grid', 'inline-block', 'inline'] as const

export type DisplayValue = (typeof DISPLAY_VALUES)[number]

export const STYLE_PROPERTIES: readonly StyleProperty[] = [
  // First because it is the most structural property, and the one the
  // Frame tool has just set at creation time.
  { key: 'display', label: 'Display', input: 'select', options: DISPLAY_VALUES },
  { key: 'width', label: 'Width', input: 'length', placeholder: 'auto' },
  { key: 'minHeight', label: 'Min height', input: 'length', placeholder: '0' },
  { key: 'padding', label: 'Padding', input: 'length', placeholder: '0' },
  { key: 'margin', label: 'Margin', input: 'length', placeholder: '0' },
  { key: 'backgroundColor', label: 'Background', input: 'color' },
  { key: 'borderWidth', label: 'Border width', input: 'length', placeholder: '0' },
  {
    key: 'borderStyle',
    label: 'Border style',
    input: 'select',
    options: ['none', 'solid', 'dashed', 'dotted'],
  },
  { key: 'borderColor', label: 'Border color', input: 'color' },
  { key: 'borderRadius', label: 'Radius', input: 'length', placeholder: '0' },

  // Both govern how a frame and its children resolve size conflicts.
  //
  // `overflow` defaults to `visible`, so a child that outgrows its parent
  // simply spills out and paints over whatever is beneath — this is the
  // only property that clips, or produces a scrollbar.
  //
  // `flexShrink` exists because flex items default to `flex-shrink: 1`:
  // a child drawn 500px wide inside a 360px flex parent silently shrinks
  // to fit while the inspector still reads 500px. Setting 0 makes the
  // drawn width stick. It only does anything inside a flex parent, which
  // is not enforced — the schema deliberately doesn't model property
  // interdependencies.
  {
    key: 'overflow',
    label: 'Overflow',
    input: 'select',
    options: ['visible', 'auto', 'hidden', 'scroll'],
  },
  // 'length' rather than a new 'number' input: it is a free-text numeric
  // field, and one property doesn't justify another widget type.
  { key: 'flexShrink', label: 'Flex shrink', input: 'length', placeholder: '1' },
]

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
