import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import { AccessDenied } from '../components/Authorization.jsx'
import { Brand } from '../components/Brand.jsx'
import { Icon } from '../components/Icons.jsx'
import { canAccessNavigation, protectedRouteDestination } from '../utils/access.js'
import { navigate } from '../utils/router.js'
import { TeamManagementPage } from './TeamManagementPage.jsx'

const baseNavigation = [
  { path: '/console', label: 'Overview', icon: 'grid', exact: true },
  { path: '/console/leads', label: 'Leads', icon: 'lead', permission: PERMISSIONS.LEADS_READ },
  { path: '/console/customers', label: 'Customers', icon: 'users', anyPermission: [PERMISSIONS.ACCOUNTS_READ, PERMISSIONS.CUSTOMER_CONTEXT_READ] },
  { path: '/console/pipeline', label: 'Pipeline', icon: 'briefcase', permission: PERMISSIONS.PIPELINE_READ },
  { path: '/console/activity', label: 'Activity', icon: 'activity', permission: PERMISSIONS.ACTIVITIES_READ },
  { path: '/console/team', label: 'Team Management', icon: 'shield', permission: PERMISSIONS.TEAM_MEMBERS_READ },
]

const placeholderContent = {
  '/console/leads': ['Leads', 'Lead management will appear here as the CRM workflow is implemented.'],
  '/console/customers': ['Customers', 'Customer accounts and relationship context will appear here.'],
  '/console/pipeline': ['Pipeline', 'Deal stages and authorized pipeline reporting will appear here.'],
  '/console/activity': ['Activity', 'Calls, notes, tasks, and customer touchpoints will appear here.'],
}

function Overview({ profile, roles }) {
  return <div className="console-content"><div className="page-heading"><div><span className="section-kicker">Workspace overview</span><h1>Good to see you{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}.</h1><p>Your LeadSphere console is ready. CRM modules will populate as your team begins working.</p></div></div><div className="empty-dashboard"><div className="dashboard-welcome"><span className="feature-icon"><Icon name="activity"/></span><h2>Your operating view starts here</h2><p>Once leads, customer records, and deals are added, this dashboard will show only the information your role is permitted to access.</p></div><div className="access-card"><small>Current access</small><strong>{roles.map((role) => role.name).join(', ') || 'No role assigned'}</strong><span>Permissions are enforced by Supabase Row Level Security.</span></div></div></div>
}

function Placeholder({ title, description }) {
  return <div className="console-content"><div className="page-heading"><div><span className="section-kicker">CRM module</span><h1>{title}</h1><p>{description}</p></div></div><div className="empty-state module-empty"><Icon name="briefcase" size={28}/><h2>{title} is ready for its next build phase.</h2><p>No operational data has been created.</p></div></div>
}

export function ConsolePage({ pathname }) {
  const { session, profile, roles, permissionScopes, loading, accessError, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const destination = protectedRouteDestination({ loading, hasSession: Boolean(session) })
    if (destination) navigate(destination, { replace: true })
  }, [loading, session])

  if (loading) return <main className="centered-page"><div className="loading-state">Loading your secure workspace…</div></main>
  if (!session) return null

  const navigation = baseNavigation.filter((item) => canAccessNavigation(item, permissionScopes))
  const requestedItem = baseNavigation.find((item) => item.path === pathname)
  const authorized = !requestedItem || canAccessNavigation(requestedItem, permissionScopes)
  const logout = async () => { await signOut(); navigate('/login', { replace: true }) }

  let content
  if (!authorized) content = <AccessDenied />
  else if (pathname === '/console') content = <Overview profile={profile} roles={roles}/>
  else if (pathname === '/console/team') content = <TeamManagementPage />
  else if (placeholderContent[pathname]) content = <Placeholder title={placeholderContent[pathname][0]} description={placeholderContent[pathname][1]}/>
  else content = <Placeholder title="Console" description="This protected module has not been configured yet."/>

  return (
    <div className="console-shell">
      <aside className={`console-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand"><Brand/><button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><Icon name="close"/></button></div>
        <nav aria-label="Console navigation">{navigation.map((item) => <button key={item.path} className={`sidebar-link ${pathname === item.path ? 'active' : ''}`} onClick={() => { navigate(item.path); setMenuOpen(false) }}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
        <div className="sidebar-foot"><button className="sidebar-link" onClick={logout}><Icon name="logout"/><span>Sign out</span></button></div>
      </aside>
      {menuOpen && <button className="sidebar-overlay" onClick={() => setMenuOpen(false)} aria-label="Close navigation"/>}
      <div className="console-main">
        <header className="console-topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Icon name="menu"/></button><span className="topbar-context">ElDream workspace</span><div className="profile-chip"><span>{(profile?.display_name || session.user.email || 'U').slice(0,1).toUpperCase()}</span><div><strong>{profile?.display_name || 'LeadSphere user'}</strong><small>{roles[0]?.name || 'Access pending'}</small></div></div></header>
        {accessError && <div className="alert alert-error console-alert">{accessError}</div>}
        {content}
      </div>
    </div>
  )
}
