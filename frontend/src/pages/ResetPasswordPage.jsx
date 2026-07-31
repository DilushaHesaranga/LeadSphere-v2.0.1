import { useState } from 'react'
import { Brand } from '../components/Brand.jsx'
import { navigate } from '../utils/router.js'
import { supabase } from '../utils/supabase.js'

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault(); setError('')
    if (password.length < 10) return setError('Use at least 10 characters for your password.')
    if (password !== confirm) return setError('The passwords do not match.')
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) return setError(updateError.message)
    navigate('/console', { replace: true })
  }

  return <main className="centered-page auth-simple"><div className="simple-card"><Brand/><span className="section-kicker">Secure your account</span><h1>Choose a new password</h1><p>Use a strong password that you do not reuse elsewhere.</p><form onSubmit={submit}>{error && <div className="alert alert-error">{error}</div>}<label className="field"><span>New password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label><label className="field"><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)}/></label><button className="button button-primary button-full" disabled={loading}>{loading ? 'Updating…' : 'Update password'}</button></form></div></main>
}
