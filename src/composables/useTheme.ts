import { ref, watchEffect } from 'vue'

/**
 * The explicit themes a user can pin. Adding a theme here is the only
 * change this file needs — the class list, the type, and the stored-value
 * validation below all derive from it.
 *
 * Must stay in sync with the `:root.theme-*` blocks in
 * src/assets/theme/ and with the bootstrap allowlist in index.html.
 */
export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

/** An explicit theme, or `system` to defer to `prefers-color-scheme`. */
export type ThemePreference = Theme | 'system'

const STORAGE_KEY = 'theme'
const THEME_CLASSES = THEMES.map((theme) => `theme-${theme}`)

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme)
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isTheme(stored)) return stored
  } catch {
    // localStorage unavailable (private browsing, disabled storage, etc).
  }
  return 'system'
}

const preference = ref<ThemePreference>(readStoredPreference())

watchEffect(() => {
  const root = document.documentElement
  root.classList.remove(...THEME_CLASSES)

  if (isTheme(preference.value)) {
    root.classList.add(`theme-${preference.value}`)
  }

  try {
    if (isTheme(preference.value)) {
      localStorage.setItem(STORAGE_KEY, preference.value)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Ignore write failures; the class toggle above still works for
    // the current page load, it just won't persist across visits.
  }
})

/**
 * Runtime theme override, layered on top of the CSS-only system.
 *
 * The page already renders correctly with zero JavaScript by following
 * the OS `prefers-color-scheme`. This composable exists only so the app
 * can offer a manual toggle that overrides that preference, by setting a
 * `theme-light` / `theme-dark` class on <html> — the same class hook
 * src/assets/theme/tokens.css already understands.
 *
 * State is module-level on purpose: the theme is a single global, so
 * every caller shares one ref rather than each mounting its own.
 */
export function useTheme() {
  return { preference }
}
