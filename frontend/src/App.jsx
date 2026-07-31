import { useEffect, useState } from 'react'
import { AuthProvider } from './auth/AuthContext.jsx'
import { ProtectedRoute } from './components/Authorization.jsx'
import { AcceptInvitePage } from './pages/AcceptInvitePage.jsx'
import { ConsolePage } from './pages/ConsolePage.jsx'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.jsx'
import { LandingPage } from './pages/LandingPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { ResetPasswordPage } from './pages/ResetPasswordPage.jsx'
import { navigate } from './utils/router.js'
import './App.css'

function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const updatePath = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', updatePath)
    return () => window.removeEventListener('popstate', updatePath)
  }, [])

  return pathname
}

function NotFoundPage() {
  return (
    <main className="centered-page">
      <div className="empty-state">
        <span className="eyebrow">404</span>
        <h1>That page is outside the sphere.</h1>
        <p>The page may have moved or the address may be incorrect.</p>
        <button className="button button-primary" onClick={() => navigate('/')}>
          Return home
        </button>
      </div>
    </main>
  )
}

function Routes() {
  const pathname = usePathname()

  if (pathname === '/') return <LandingPage />
  if (pathname === '/login') return <LoginPage />
  if (pathname === '/forgot-password') return <ForgotPasswordPage />
  if (pathname === '/reset-password') return <ResetPasswordPage />
  if (pathname === '/accept-invite') return <AcceptInvitePage />
  if (pathname === '/console' || pathname.startsWith('/console/')) {
    return <ProtectedRoute><ConsolePage pathname={pathname} /></ProtectedRoute>
  }
  return <NotFoundPage />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  )
}
