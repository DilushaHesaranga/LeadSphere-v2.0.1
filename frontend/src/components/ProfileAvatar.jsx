import { initialsFor } from '../utils/profile.js'

export function ProfileAvatar({ name, email, src, size = 'medium', className = '' }) {
  return (
    <span className={`profile-avatar profile-avatar-${size} ${className}`.trim()} aria-hidden="true">
      {src ? <img src={src} alt="" /> : <span>{initialsFor(name, email)}</span>}
    </span>
  )
}
