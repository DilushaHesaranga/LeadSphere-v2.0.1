import { useEffect, useRef, useState } from 'react'
import { useProfilePreferences } from '../preferences/ProfilePreferencesContext.jsx'
import { Icon } from './Icons.jsx'
import { ProfileAvatar } from './ProfileAvatar.jsx'
import { ProfileEditor } from './ProfileEditor.jsx'
import { ThemeModeControl } from './ThemeModeControl.jsx'

export function UserProfileMenu({ profile, roles, email, onSignOut }) {
  const { avatarUrl, bannerColor, setThemeMode, themeMode } = useProfilePreferences()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const wrapperRef = useRef(null)
  const triggerRef = useRef(null)
  const firstActionRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape' || editing) return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    firstActionRef.current?.focus()
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [editing, open])

  const changeTheme = async (mode) => {
    setError('')
    try {
      await setThemeMode(mode)
    } catch {
      setError('Theme preference could not be saved.')
    }
  }

  const displayName = profile?.display_name || 'LeadSphere user'
  const roleName = roles.map((role) => role.name).join(', ') || 'Access pending'

  return (
    <div className="profile-menu" ref={wrapperRef}>
      <button ref={triggerRef} type="button" className="profile-trigger" aria-expanded={open} aria-controls="user-profile-card" aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        <ProfileAvatar name={displayName} email={email} src={avatarUrl} size="small" />
        <span className="profile-trigger-copy"><strong>{displayName}</strong><small>{roleName}</small></span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <section id="user-profile-card" className="profile-card" role="dialog" aria-label="User profile and settings">
          <div className="profile-card-banner" style={{ backgroundColor: bannerColor }} />
          <div className="profile-card-body">
            <ProfileAvatar name={displayName} email={email} src={avatarUrl} size="large" className="profile-card-avatar" />
            <div className="profile-card-identity"><strong>{displayName}</strong><span>{roleName}</span><small>{email}</small></div>
            {message && <div className="profile-inline-message" role="status">{message}</div>}
            {error && <div className="profile-inline-error" role="alert">{error}</div>}
            <div className="profile-card-section"><span>Appearance</span><ThemeModeControl value={themeMode} onChange={changeTheme} compact /></div>
            <div className="profile-card-actions">
              <button ref={firstActionRef} type="button" onClick={() => setEditing(true)}><Icon name="edit" size={17} /><span>Edit profile</span></button>
              <button type="button" onClick={onSignOut}><Icon name="logout" size={17} /><span>Sign out</span></button>
            </div>
          </div>
        </section>
      )}
      {editing && <ProfileEditor profile={profile} email={email} onClose={() => { setEditing(false); triggerRef.current?.focus() }} onSaved={() => setMessage('Profile saved.')} />}
    </div>
  )
}
