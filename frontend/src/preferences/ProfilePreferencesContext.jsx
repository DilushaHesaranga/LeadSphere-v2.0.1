/* oxlint-disable react/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { createAvatarUrl, saveThemeMode, saveUserProfile } from '../utils/profile.js'
import {
  ACCENT_STORAGE_KEY,
  applyAppearance,
  DEFAULT_ACCENT,
  normalizeHexColor,
  normalizeThemeMode,
  THEME_STORAGE_KEY,
} from '../utils/theme.js'

const ProfilePreferencesContext = createContext(null)

function readStored(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

export function ProfilePreferencesProvider({ children }) {
  const { profile, user, refreshAccess } = useAuth()
  const [themeMode, setThemeModeState] = useState(() => normalizeThemeMode(readStored(THEME_STORAGE_KEY, 'system')))
  const [bannerColor, setBannerColor] = useState(() => normalizeHexColor(readStored(ACCENT_STORAGE_KEY, DEFAULT_ACCENT)))
  const [resolvedTheme, setResolvedTheme] = useState('light')
  const [avatarUrl, setAvatarUrl] = useState(null)

  useEffect(() => {
    if (!profile) return
    setThemeModeState(normalizeThemeMode(profile.theme_mode))
    setBannerColor(normalizeHexColor(profile.banner_color))
  }, [profile])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const appearance = applyAppearance({ mode: themeMode, accent: bannerColor }, document.documentElement, media.matches)
      setResolvedTheme(appearance.resolved)
    }
    apply()
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode)
      localStorage.setItem(ACCENT_STORAGE_KEY, bannerColor)
    } catch {
      // Appearance still works when storage is unavailable.
    }
    media.addEventListener?.('change', apply)
    return () => media.removeEventListener?.('change', apply)
  }, [bannerColor, themeMode])

  useEffect(() => {
    let active = true
    setAvatarUrl(null)
    if (!profile?.avatar_path) return () => { active = false }
    createAvatarUrl(profile.avatar_path)
      .then((url) => active && setAvatarUrl(url))
      .catch(() => active && setAvatarUrl(null))
    return () => { active = false }
  }, [profile?.avatar_path])

  const setThemeMode = useCallback(async (nextMode) => {
    const mode = normalizeThemeMode(nextMode)
    const previous = themeMode
    setThemeModeState(mode)
    if (!user) return mode
    try {
      await saveThemeMode(user.id, mode)
      await refreshAccess()
      return mode
    } catch (error) {
      setThemeModeState(previous)
      throw error
    }
  }, [refreshAccess, themeMode, user])

  const updateProfile = useCallback(async (changes) => {
    if (!user) throw new Error('Your session has expired. Please sign in again.')
    const updated = await saveUserProfile({
      ...changes,
      userId: user.id,
      currentAvatarPath: profile?.avatar_path,
    })
    setThemeModeState(normalizeThemeMode(updated.theme_mode))
    setBannerColor(normalizeHexColor(updated.banner_color))
    await refreshAccess()
    return updated
  }, [profile?.avatar_path, refreshAccess, user])

  const value = useMemo(() => ({
    avatarUrl,
    bannerColor,
    resolvedTheme,
    setThemeMode,
    themeMode,
    updateProfile,
  }), [avatarUrl, bannerColor, resolvedTheme, setThemeMode, themeMode, updateProfile])

  return <ProfilePreferencesContext.Provider value={value}>{children}</ProfilePreferencesContext.Provider>
}

export function useProfilePreferences() {
  const context = useContext(ProfilePreferencesContext)
  if (!context) throw new Error('useProfilePreferences must be used within ProfilePreferencesProvider')
  return context
}
