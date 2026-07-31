import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { Brand } from '../components/Brand.jsx'
import { Icon } from '../components/Icons.jsx'
import { navigate } from '../utils/router.js'
import { supabase } from '../utils/supabase.js'

export function LoginPage() {
  const { session, loading: authLoading, refreshAccess } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authLoading && session) navigate('/console', { replace: true })
  }, [authLoading, session])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!email.trim() || !password) return setError('Enter your email address and password.')
    setLoading(true)
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (authError) {
      setError(authError.message === 'Invalid login credentials' ? 'The email address or password is incorrect.' : authError.message)
      setLoading(false)
      return
    }
    await refreshAccess(data.session)
    navigate('/console', { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-brand-panel">
        <a href="/" className="brand-link light-brand"><Brand /></a>
        <div><span className="eyebrow dark-eyebrow">Lead with context</span><h1>Your customer workspace is ready.</h1><p>Sign in to keep leads moving, align the team, and build stronger customer relationships.</p></div>
        <small>Secure access powered by Supabase Authentication</small>
      </div>
      <main className="auth-form-panel">
        <div className="auth-card">
          <a className="back-link" href="/">← Back to LeadSphere</a>
          <span className="section-kicker">Welcome back</span>
          <h2>Sign in to your console</h2>
          <p className="form-intro">Use the work email address connected to your LeadSphere account.</p>
          <form onSubmit={submit} noValidate>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <label className="field"><span>Email address</span><div className="input-wrap"><Icon name="mail" size={18}/><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required /></div></label>
            <label className="field"><span>Password</span><div className="input-wrap"><Icon name="lock" size={18}/><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required /><button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={18}/></button></div></label>
            <div className="form-options"><a href="/forgot-password">Forgotten password?</a></div>
            <button className="button button-primary button-full" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'} {!loading && <Icon name="arrow" size={18}/>}</button>
          </form>
        </div>
      </main>
    </div>
  )
}
