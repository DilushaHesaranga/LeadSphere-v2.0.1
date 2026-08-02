import { supabase } from './supabase.js'
import { normalizeHexColor, normalizeThemeMode } from './theme.js'

export const AVATAR_BUCKET = 'profile-avatars'
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024
export const AVATAR_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp'])

const extensionByType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export function initialsFor(name, email = '') {
  const source = String(name || '').trim()
  if (!source) return String(email || 'U').slice(0, 1).toUpperCase()
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export function validateAvatarFile(file) {
  if (!file) return ''
  if (!AVATAR_TYPES.includes(file.type)) return 'Choose a JPG, PNG, or WebP image.'
  if (file.size > MAX_AVATAR_BYTES) return 'Avatar images must be 2 MB or smaller.'
  return ''
}

export async function createAvatarUrl(path) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function saveUserProfile({ userId, displayName, bannerColor, themeMode, avatarFile, resetAvatar, currentAvatarPath }) {
  const trimmedName = String(displayName || '').trim()
  if (trimmedName.length < 2 || trimmedName.length > 80) {
    throw new Error('Display name must be between 2 and 80 characters.')
  }

  const avatarError = validateAvatarFile(avatarFile)
  if (avatarError) throw new Error(avatarError)

  let uploadedPath = null
  let nextAvatarPath = resetAvatar ? null : currentAvatarPath || null
  if (avatarFile) {
    const extension = extensionByType[avatarFile.type]
    uploadedPath = `${userId}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(uploadedPath, avatarFile, {
      cacheControl: '3600',
      contentType: avatarFile.type,
      upsert: false,
    })
    if (error) throw error
    nextAvatarPath = uploadedPath
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      display_name: trimmedName,
      banner_color: normalizeHexColor(bannerColor),
      theme_mode: normalizeThemeMode(themeMode),
      avatar_path: nextAvatarPath,
    })
    .eq('id', userId)
    .select('id, email, display_name, status, avatar_path, banner_color, theme_mode')
    .single()

  if (error) {
    if (uploadedPath) await supabase.storage.from(AVATAR_BUCKET).remove([uploadedPath])
    throw error
  }

  if (currentAvatarPath && currentAvatarPath !== nextAvatarPath) {
    await supabase.storage.from(AVATAR_BUCKET).remove([currentAvatarPath])
  }
  return data
}

export async function saveThemeMode(userId, themeMode) {
  const mode = normalizeThemeMode(themeMode)
  const { error } = await supabase.from('profiles').update({ theme_mode: mode }).eq('id', userId)
  if (error) throw error
  return mode
}
