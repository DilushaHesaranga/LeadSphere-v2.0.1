import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import { AccessDenied } from '../components/Authorization.jsx'
import { Brand } from '../components/Brand.jsx'
import { Icon } from '../components/Icons.jsx'
import { NotificationCenter } from '../components/NotificationCenter.jsx'
import { caseTicketService } from '../services/caseTicketService.js'
import { UserProfileMenu } from '../components/UserProfileMenu.jsx'
import { canAccessNavigation, protectedRouteDestination } from '../utils/access.js'
import { navigate } from '../utils/router.js'
import { TeamManagementPage } from './TeamManagementPage.jsx'
import { CaseWorkspacePage } from './CaseWorkspacePage.jsx'
import { CaseDetailPage } from './CaseDetailPage.jsx'
import { PermissionsPage } from './PermissionsPage.jsx'
import { TicketDetailPage } from './TicketDetailPage.jsx'
import { FollowUpsPage } from './FollowUpsPage.jsx'

const baseNavigation = [
  { path: '/console', label: 'Overview', icon: 'grid', exact: true },
  { path: '/console/leads', label: 'Leads', icon: 'lead', anyPermission: [PERMISSIONS.LEADS_READ, PERMISSIONS.TICKETS_READ] },
  { path: '/console/customers', label: 'Customers', icon: 'users', anyPermission: [PERMISSIONS.ACCOUNTS_READ, PERMISSIONS.CUSTOMER_CONTEXT_READ, PERMISSIONS.TICKETS_READ] },
  { path: '/console/follow-ups', label: 'Follow Ups', icon: 'calendar', permission: PERMISSIONS.TICKETS_READ },
  { path: '/console/cases', label: 'Cases', icon: 'file' },
  { path: '/console/timeline', label: 'Timeline', icon: 'timeline' },
  { path: '/console/pipeline', label: 'Pipeline', icon: 'briefcase', permission: PERMISSIONS.PIPELINE_READ },
  { path: '/console/activity', label: 'Activity', icon: 'activity', permission: PERMISSIONS.ACTIVITIES_READ },
  { path: '/console/permissions', label: 'Permissions', icon: 'lock', permission: PERMISSIONS.TICKET_REQUESTS_REVIEW },
  { path: '/console/team', label: 'Team Management', icon: 'shield', permission: PERMISSIONS.TEAM_MEMBERS_READ },
]

const placeholderContent = {
  '/console/cases': ['Cases', 'Cases functionality will be available in a future update.'],
  '/console/timeline': ['Timeline', 'Timeline functionality will be available in a future update.'],
  '/console/pipeline': ['Pipeline', 'Deal stages and authorized pipeline reporting will appear here.'],
  '/console/activity': ['Activity', 'Calls, notes, tasks, and customer touchpoints will appear here.'],
}

function Overview({ profile, roles }) {
  return (
    <div className="console-content">
      <div className="page-heading overview-heading">
        <div>
          <span className="section-kicker">Workspace overview</span>
          <h1>Good to see you{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}.</h1>
          <p>Your customer work, team context, and next actions will come together here.</p>
        </div>
        <span className="workspace-status"><i /> Workspace ready</span>
      </div>
      <div className="empty-dashboard">
        <div className="dashboard-welcome">
          <span className="feature-icon"><Icon name="activity"/></span>
          <span className="dashboard-label">One connected customer story</span>
          <h2>Your operating view starts here</h2>
          <p>As your team captures leads and customer activity, LeadSphere will turn those signals into a clear, permission-aware path from first contact to delivery.</p>
          <div className="journey-strip" aria-label="LeadSphere customer workflow">
            <span><b>01</b> Capture</span><i /><span><b>02</b> Understand</span><i /><span><b>03</b> Move forward</span>
          </div>
        </div>
        <div className="access-card">
          <small>Your working lens</small>
          <strong>{roles.map((role) => role.name).join(', ') || 'No role assigned'}</strong>
          <span>Your workspace only reveals the customer and team context authorised for this role.</span>
          <div className="access-assurance"><Icon name="shield" size={16} /> Protected by database-level access rules</div>
        </div>
      </div>
    </div>
  )
}

function Placeholder({ title, description }) {
  return <div className="console-content"><div className="page-heading"><div><span className="section-kicker">CRM module</span><h1>{title}</h1><p>{description}</p></div></div><div className="empty-state module-empty"><Icon name="briefcase" size={28}/><h2>{title} is ready for its next build phase.</h2><p>No operational data has been created.</p></div></div>
}

export function ConsolePage({ pathname }) {
  const { session, profile, roles, permissionScopes, loading, accessError, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  const userId = session?.user?.id
  const mayReviewRequests = canAccessNavigation(baseNavigation.find((item) => item.path === '/console/permissions'), permissionScopes)

  const loadPendingRequestCount = useCallback(async () => {
    if (!userId || !mayReviewRequests) return setPendingRequestCount(0)
    try {
      const pending = await caseTicketService.listRequests('PENDING')
      setPendingRequestCount(pending.length)
    } catch { setPendingRequestCount(0) }
  }, [mayReviewRequests, userId])

  useEffect(() => {
    loadPendingRequestCount()
    if (!mayReviewRequests) return undefined
    const timer = window.setInterval(loadPendingRequestCount, 30000)
    const refresh = () => loadPendingRequestCount()
    window.addEventListener('leadsphere:permissions-changed', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('leadsphere:permissions-changed', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [loadPendingRequestCount, mayReviewRequests])

  useEffect(() => {
    const destination = protectedRouteDestination({ loading, hasSession: Boolean(session) })
    if (destination) navigate(destination, { replace: true })
  }, [loading, session])

  if (loading) return <main className="centered-page"><div className="loading-state">Loading your secure workspace…</div></main>
  if (!session) return null

  const navigation = baseNavigation.filter((item) => canAccessNavigation(item, permissionScopes))
  const isCaseRoute = /^\/console\/cases\/[0-9a-f-]+$/i.test(pathname)
  const isTicketRoute = /^\/console\/tickets\/[0-9a-f-]+$/i.test(pathname)
  const requestedItem = baseNavigation.find((item) => item.path === pathname)
    ?? (isCaseRoute ? { permission: PERMISSIONS.CASES_READ } : null)
    ?? (isTicketRoute ? { permission: PERMISSIONS.TICKETS_READ } : null)
  const authorized = !requestedItem || canAccessNavigation(requestedItem, permissionScopes)
  const logout = async () => { await signOut(); navigate('/login', { replace: true }) }

  let content
  if (!authorized) content = <AccessDenied />
  else if (pathname === '/console') content = <Overview profile={profile} roles={roles}/>
  else if (pathname === '/console/leads') content = <CaseWorkspacePage area="leads" />
  else if (pathname === '/console/customers') content = <CaseWorkspacePage area="customers" />
  else if (pathname === '/console/follow-ups') content = <FollowUpsPage />
  else if (pathname === '/console/permissions') content = <PermissionsPage />
  else if (pathname === '/console/team') content = <TeamManagementPage />
  else if (isCaseRoute) content = <CaseDetailPage caseId={pathname.split('/').at(-1)} />
  else if (isTicketRoute) content = <TicketDetailPage ticketId={pathname.split('/').at(-1)} />
  else if (placeholderContent[pathname]) content = <Placeholder title={placeholderContent[pathname][0]} description={placeholderContent[pathname][1]}/>
  else content = <Placeholder title="Console" description="This protected module has not been configured yet."/>

  return (
    <div className="console-shell">
      <aside className={`console-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand"><Brand/><button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><Icon name="close"/></button></div>
        <nav aria-label="Console navigation">{navigation.map((item) => <button key={item.path} className={`sidebar-link ${pathname === item.path ? 'active' : ''}`} onClick={() => { navigate(item.path); setMenuOpen(false) }}><Icon name={item.icon}/><span>{item.label}</span>{item.path === '/console/permissions' && pendingRequestCount > 0 && <span className="sidebar-count" aria-label={`${pendingRequestCount} pending permission requests`}>{pendingRequestCount > 99 ? '99+' : pendingRequestCount}</span>}</button>)}</nav>
        <div className="sidebar-foot"><button className="sidebar-link" onClick={logout}><Icon name="logout"/><span>Sign out</span></button></div>
      </aside>
      {menuOpen && <button className="sidebar-overlay" onClick={() => setMenuOpen(false)} aria-label="Close navigation"/>}
      <div className="console-main">
        <header className="console-topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Icon name="menu"/></button>
          <div className="topbar-actions"><NotificationCenter/><UserProfileMenu profile={profile} roles={roles} email={session.user.email} onSignOut={logout} /></div>
        </header>
        {accessError && <div className="alert alert-error console-alert">{accessError}</div>}
        {content}
      </div>
    </div>
  )
}
