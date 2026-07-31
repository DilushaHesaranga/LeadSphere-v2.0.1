import { useState } from 'react'
import { Brand } from '../components/Brand.jsx'
import { Icon } from '../components/Icons.jsx'
import { supabase } from '../utils/supabase.js'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage('')
    if (!email.trim()) return setError('Enter your email address.')
    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${window.location.origin}/reset-password` })
    setLoading(false)
    if (resetError) return setError(resetError.message)
    setMessage('If an account exists for that email, a password reset link has been sent.')
  }

  return <main className="centered-page auth-simple"><div className="simple-card"><Brand/><span className="section-kicker">Account recovery</span><h1>Reset your password</h1><p>Enter your work email and we’ll send a secure recovery link.</p><form onSubmit={submit}>{error && <div className="alert alert-error">{error}</div>}{message && <div className="alert alert-success">{message}</div>}<label className="field"><span>Email address</span><div className="input-wrap"><Icon name="mail" size={18}/><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com"/></div></label><button className="button button-primary button-full" disabled={loading}>{loading ? 'Sending…' : 'Send recovery link'}</button></form><a className="text-link" href="/login">Back to sign in</a></div></main>
}
