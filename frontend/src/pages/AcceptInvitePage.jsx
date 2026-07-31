import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { Brand } from '../components/Brand.jsx'
import { navigate } from '../utils/router.js'
import { supabase } from '../utils/supabase.js'

export function AcceptInvitePage() {
  const { session, loading: authLoading, refreshAccess } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault(); setError('')
    if (displayName.trim().length < 2) return setError('Enter a display name with at least 2 characters.')
    if (password.length < 10) return setError('Use at least 10 characters for your password.')
    if (password !== confirm) return setError('The passwords do not match.')
    setLoading(true)
    const { error: userError } = await supabase.auth.updateUser({ password, data: { display_name: displayName.trim() } })
    if (userError) { setLoading(false); return setError(userError.message) }
    const { error: inviteError } = await supabase.rpc('accept_invitation', { p_display_name: displayName.trim() })
    if (inviteError) { setLoading(false); return setError(inviteError.message) }
    await refreshAccess(session)
    navigate('/console', { replace: true })
  }

  if (authLoading) return <main className="centered-page"><div className="loading-state">Validating your invitation…</div></main>
  if (!session) return <main className="centered-page auth-simple"><div className="simple-card"><Brand/><span className="section-kicker">Invitation unavailable</span><h1>This invitation link is invalid or has expired.</h1><p>Ask your LeadSphere administrator to send a new invitation.</p><a className="button button-primary" href="/login">Go to sign in</a></div></main>

  return <main className="centered-page auth-simple"><div className="simple-card wide-card"><Brand/><span className="section-kicker">Join LeadSphere</span><h1>Finish setting up your account</h1><p>Your role has already been assigned securely by your administrator.</p><form onSubmit={submit}>{error && <div className="alert alert-error" role="alert">{error}</div>}<label className="field"><span>Display name</span><input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name"/></label><label className="field"><span>Password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 10 characters"/></label><label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)}/></label><button className="button button-primary button-full" disabled={loading}>{loading ? 'Creating your account…' : 'Join LeadSphere'}</button></form></div></main>
}