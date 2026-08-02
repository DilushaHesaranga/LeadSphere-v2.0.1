export const DEFAULT_ACCENT = '#16734b'
export const THEME_MODES = Object.freeze(['light', 'dark', 'system'])
export const THEME_STORAGE_KEY = 'leadsphere.theme-mode'
export const ACCENT_STORAGE_KEY = 'leadsphere.banner-color'

export function normalizeHexColor(value, fallback = DEFAULT_ACCENT) {
  const candidate = String(value || '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(candidate)) return candidate
  if (/^#[0-9a-f]{3}$/.test(candidate)) {
    return `#${candidate.slice(1).split('').map((character) => character.repeat(2)).join('')}`
  }
  return fallback
}

export function normalizeThemeMode(value) {
  return THEME_MODES.includes(value) ? value : 'system'
}

function toRgb(color) {
  const normalized = normalizeHexColor(color)
  return [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16))
}

function toHex(channels) {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

export function mixHex(color, target, weight) {
  const sourceRgb = toRgb(color)
  const targetRgb = toRgb(target)
  return toHex(sourceRgb.map((channel, index) => channel + (targetRgb[index] - channel) * weight))
}

export function relativeLuminance(color) {
  const channels = toRgb(color).map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

export function contrastText(color) {
  return relativeLuminance(color) > 0.179 ? '#102018' : '#ffffff'
}

export function createAccentTokens(color) {
  const accent = normalizeHexColor(color)
  return {
    accent,
    accentStrong: mixHex(accent, '#000000', 0.28),
    accentSoft: mixHex(accent, '#ffffff', 0.86),
    accentMuted: mixHex(accent, '#ffffff', 0.68),
    accentContrast: contrastText(accent),
  }
}

export function resolveTheme(mode, prefersDark = false) {
  const normalized = normalizeThemeMode(mode)
  return normalized === 'system' ? (prefersDark ? 'dark' : 'light') : normalized
}

export function applyAppearance({ mode, accent }, root = document.documentElement, prefersDark) {
  const normalizedMode = normalizeThemeMode(mode)
  const mediaPrefersDark = prefersDark ?? window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const resolved = resolveTheme(normalizedMode, mediaPrefersDark)
  const tokens = createAccentTokens(accent)

  root.dataset.theme = resolved
  root.dataset.themeMode = normalizedMode
  root.style.colorScheme = resolved
  root.style.setProperty('--accent', tokens.accent)
  root.style.setProperty('--accent-strong', tokens.accentStrong)
  root.style.setProperty('--accent-soft', tokens.accentSoft)
  root.style.setProperty('--accent-muted', tokens.accentMuted)
  root.style.setProperty('--accent-contrast', tokens.accentContrast)
  return { mode: normalizedMode, resolved, ...tokens }
}
