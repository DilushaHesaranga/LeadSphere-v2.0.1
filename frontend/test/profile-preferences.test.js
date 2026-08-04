import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  applyAppearance,
  contrastText,
  createAccentTokens,
  normalizeHexColor,
  resolveTheme,
} from '../src/utils/theme.js'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const read = (path) => readFileSync(`${projectRoot}${path}`, 'utf8')
const profileMenu = read('src/components/UserProfileMenu.jsx')
const profileEditor = read('src/components/ProfileEditor.jsx')
const preferences = read('src/preferences/ProfilePreferencesContext.jsx')
const styles = read('src/App.css')
const prepaint = read('index.html')
const migration = read('../supabase/migrations/20260802000100_profile_preferences_and_avatars.sql')

test('profile card supports trigger, outside click, Escape, and edit mode', () => {
  assert.match(profileMenu, /aria-expanded=\{open\}/)
  assert.match(profileMenu, /document\.addEventListener\('pointerdown', closeOutside\)/)
  assert.match(profileMenu, /event\.key !== 'Escape'/)
  assert.match(profileMenu, /setEditing\(true\)/)
  assert.match(profileEditor, /role="dialog" aria-modal="true"/)
  assert.match(profileEditor, /createPortal/)
  assert.match(profileEditor, /document\.body/)
})

test('profile editor is centered against the viewport and remains scrollable on mobile', () => {
  assert.match(styles, /\.profile-editor-backdrop \{[^}]*place-items:center/)
  assert.match(styles, /\.profile-editor \{[^}]*max-height:calc\(100dvh - 32px\)/)
})
test('saved profile data refreshes the authoritative access profile immediately', () => {
  assert.match(preferences, /await saveUserProfile/)
  assert.match(preferences, /await refreshAccess\(\)/)
  assert.match(profileMenu, /Profile saved\./)
})

test('avatar has fallback initials and uploaded-image rendering contracts', () => {
  const avatar = read('src/components/ProfileAvatar.jsx')
  assert.match(avatar, /src \? <img src=\{src\}/)
  assert.match(avatar, /initialsFor\(name, email\)/)
  assert.match(profileEditor, /accept="image\/jpeg,image\/png,image\/webp"/)
  assert.match(profileEditor, /Maximum 2 MB/)
})

test('theme and accent preferences survive reload without a paint flash', () => {
  assert.match(prepaint, /leadsphere\.theme-mode/)
  assert.match(prepaint, /leadsphere\.banner-color/)
  assert.match(prepaint, /document\.documentElement\.dataset\.theme = resolved/)
  assert.match(preferences, /localStorage\.setItem\(THEME_STORAGE_KEY, themeMode\)/)
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
})

test('accent tokens normalize input and derive readable contrast colours', () => {
  assert.equal(normalizeHexColor('#AbC'), '#aabbcc')
  assert.equal(normalizeHexColor('not-a-colour'), '#16734b')
  assert.equal(contrastText('#ffffff'), '#102018')
  assert.equal(contrastText('#111111'), '#ffffff')
  const tokens = createAccentTokens('#ffcc00')
  assert.equal(tokens.accent, '#ffcc00')
  assert.equal(tokens.accentContrast, '#102018')
  assert.notEqual(tokens.accentStrong, tokens.accent)
})

test('appearance application updates theme and CSS token state', () => {
  const properties = new Map()
  const root = {
    dataset: {},
    style: {
      colorScheme: '',
      setProperty: (name, value) => properties.set(name, value),
    },
  }
  const result = applyAppearance({ mode: 'system', accent: '#2364aa' }, root, true)
  assert.equal(root.dataset.theme, 'dark')
  assert.equal(root.dataset.themeMode, 'system')
  assert.equal(properties.get('--accent'), '#2364aa')
  assert.equal(result.resolved, 'dark')
})

test('profile card has mobile positioning and reduced-motion fallbacks', () => {
  assert.match(styles, /@media \(max-width:760px\)[\s\S]*\.profile-card \{ position:fixed/)
  assert.match(styles, /@media \(max-width:430px\)[\s\S]*\.profile-card/)
  assert.match(styles, /@media \(prefers-reduced-motion:reduce\)[\s\S]*\.profile-card \{ animation:none/)
})

test('database and storage policies prevent cross-user profile or avatar overwrite', () => {
  assert.match(migration, /profiles_update_own_policy[\s\S]*id = \(select auth\.uid\(\)\)/)
  assert.match(migration, /split_part\(avatar_path, '\/', 1\) = \(select auth\.uid\(\)\)::text/)
  assert.match(migration, /profile_avatars_insert_own[\s\S]*storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/)
  assert.match(migration, /profile_avatars_delete_own[\s\S]*storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/)
  assert.match(migration, /allowed_mime_types/)
  assert.match(migration, /2097152/)
})
