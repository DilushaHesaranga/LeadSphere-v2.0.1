import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProfilePreferences } from '../preferences/ProfilePreferencesContext.jsx'
import { validateAvatarFile } from '../utils/profile.js'
import { normalizeHexColor } from '../utils/theme.js'
import { Icon } from './Icons.jsx'
import { ProfileAvatar } from './ProfileAvatar.jsx'
import { ThemeModeControl } from './ThemeModeControl.jsx'

export function ProfileEditor({ profile, email, onClose, onSaved }) {
  const { avatarUrl, bannerColor, themeMode, updateProfile } = useProfilePreferences()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [color, setColor] = useState(bannerColor)
  const [mode, setMode] = useState(themeMode)
  const [avatarFile, setAvatarFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [resetAvatar, setResetAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled)')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl])

  const chooseAvatar = (event) => {
    const file = event.target.files?.[0]
    setError('')
    const validationError = validateAvatarFile(file)
    if (validationError) {
      event.target.value = ''
      setError(validationError)
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setAvatarFile(file)
    setPreviewUrl(file ? URL.createObjectURL(file) : null)
    setResetAvatar(false)
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await updateProfile({ displayName, bannerColor: color, themeMode: mode, avatarFile, resetAvatar })
      onSaved?.()
      onClose()
    } catch (saveError) {
      setError(saveError.message || 'Your profile could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const shownAvatar = resetAvatar ? null : previewUrl || avatarUrl

  return createPortal(
    <div className="modal-backdrop profile-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} className="modal profile-editor" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
        <div className="modal-header">
          <div><span className="section-kicker">Personal settings</span><h2 id="profile-editor-title">Edit profile</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close profile editor"><Icon name="close" /></button>
        </div>
        <form onSubmit={submit}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div className="avatar-editor-row">
            <ProfileAvatar name={displayName} email={email} src={shownAvatar} size="large" />
            <div>
              <label className="button button-secondary upload-button">
                <Icon name="upload" size={17} /> Choose image
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} disabled={saving} />
              </label>
              {(avatarUrl || avatarFile) && !resetAvatar && <button className="text-button reset-avatar" type="button" onClick={() => { setResetAvatar(true); setAvatarFile(null); setPreviewUrl(null) }}>Remove photo</button>}
              <small>JPG, PNG, or WebP. Maximum 2 MB.</small>
            </div>
          </div>
          <label className="field"><span>Display name</span><input ref={nameRef} value={displayName} minLength="2" maxLength="80" required onChange={(event) => setDisplayName(event.target.value)} /></label>
          <div className="field"><span>Profile and app accent</span><div className="color-field"><input type="color" value={normalizeHexColor(color)} onChange={(event) => setColor(event.target.value)} aria-label="Accent colour picker" /><input value={color} maxLength="7" pattern="#[0-9a-fA-F]{6}" onChange={(event) => setColor(event.target.value)} aria-label="Accent colour hexadecimal value" /></div><small>Your profile banner colour also highlights interactive parts of your workspace.</small></div>
          <div className="field"><span>Appearance</span><ThemeModeControl value={mode} onChange={setMode} disabled={saving} /></div>
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
