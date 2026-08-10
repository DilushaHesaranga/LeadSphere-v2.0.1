import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import { Icon } from '../components/Icons.jsx'
import { CASE_LIFECYCLES, CASE_PRIORITIES, CASE_STATUSES, caseHealthHelp, formatRate } from '../config/cases.js'
import { formatDateTime } from '../config/crm.js'
import { caseTicketService } from '../services/caseTicketService.js'
import { navigate } from '../utils/router.js'

const EMPTY_FILTERS = { status: '', lifecycle: '', priority: '', risk: '', department: '', openTickets: '', overdue: '', archived: '' }

function Kpi({ label, value, tone = '' }) {
  return <article className={`case-kpi ${tone}`}><span>{label}</span><strong>{value ?? 'N/A'}</strong></article>
}

function Health({ value }) {
  const label = { HEALTHY: 'Healthy', ATTENTION_NEEDED: 'Attention Needed', AT_RISK: 'At Risk' }[value] ?? 'Healthy'
  return <span className={`case-health health-${String(value).toLowerCase()}`} title={caseHealthHelp(value)}><i />{label}</span>
}

export function CasesPage() {
  const { can } = useAuth()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState('updatedAt')
  const [direction, setDirection] = useState('desc')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, pageSize: 25, kpis: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const mayRestore = can(PERMISSIONS.CASES_RESTORE)

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(query.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await caseTicketService.listCaseManagement({ search, filters, sort, direction, page, pageSize: 25 })) }
    catch { setError('Cases could not be loaded. Check your connection and try again.') }
    finally { setLoading(false) }
  }, [direction, filters, page, search, sort])
  useEffect(() => { load() }, [load])

  const updateFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1) }
  const applySort = (value) => {
    if (sort === value) setDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else { setSort(value); setDirection('desc') }
    setPage(1)
  }
  const totalPages = Math.max(1, Math.ceil((data.total ?? 0) / (data.pageSize || 25)))
  const kpis = data.kpis ?? {}
  const restore = async (caseId) => {
    setError(''); setMessage('')
    try { await caseTicketService.restoreCase(caseId); setMessage('Case restored successfully.'); await load() }
    catch { setError('The Case could not be restored. An active Case may already use the same company name.') }
  }

  return <div className="console-content cases-page">
    <div className="page-heading crm-heading"><div><span className="section-kicker">Company relationships</span><h1>Cases</h1><p>One complete view of every company, its Tickets, people, activity, and outcomes.</p></div></div>
    <section className="case-kpi-grid" aria-label="Case summary">
      <Kpi label="Total Cases" value={kpis.totalCases ?? 0}/><Kpi label="Active" value={kpis.activeCases ?? 0}/>
      <Kpi label="New · 30 days" value={kpis.newCases ?? 0}/><Kpi label="Customers" value={kpis.customers ?? 0}/>
      <Kpi label="Prospects" value={kpis.prospects ?? 0}/><Kpi label="Open Tickets" value={kpis.casesWithOpenTickets ?? 0}/>
      <Kpi label="Overdue Follow Ups" value={kpis.overdueFollowUps ?? 0} tone="warning"/>
      <Kpi label="High Risk" value={kpis.highRiskCases ?? 0} tone="danger"/>
      <Kpi label="Avg. Acceptance" value={formatRate(kpis.averageAcceptanceRate)}/><Kpi label="Avg. Win Rate" value={formatRate(kpis.averageWinRate)}/>
    </section>

    <section className="case-list-panel">
      <div className="case-list-toolbar">
        <label className="search-field"><span className="sr-only">Search Cases</span><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Case, contact, Ticket, domain, or employee"/></label>
        <select aria-label="Status filter" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option>{CASE_STATUSES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Lifecycle filter" value={filters.lifecycle} onChange={(event) => updateFilter('lifecycle', event.target.value)}><option value="">All lifecycle stages</option>{CASE_LIFECYCLES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Priority filter" value={filters.priority} onChange={(event) => updateFilter('priority', event.target.value)}><option value="">All priorities</option>{CASE_PRIORITIES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Department filter" value={filters.department} onChange={(event) => updateFilter('department', event.target.value)}><option value="">All departments</option><option value="marketing">Marketing</option><option value="sales">Sales</option><option value="delivery">Delivery</option></select>
        <label className="case-check"><input type="checkbox" checked={filters.openTickets === 'true'} onChange={(event) => updateFilter('openTickets', event.target.checked ? 'true' : '')}/>Open Tickets</label>
        <label className="case-check"><input type="checkbox" checked={filters.overdue === 'true'} onChange={(event) => updateFilter('overdue', event.target.checked ? 'true' : '')}/>Overdue</label>
        {mayRestore && <label className="case-check"><input type="checkbox" checked={filters.archived === 'only'} onChange={(event) => updateFilter('archived', event.target.checked ? 'only' : '')}/>Archived</label>}
        <button className="button button-secondary button-small" onClick={() => { setFilters(EMPTY_FILTERS); setQuery(''); setPage(1) }}>Clear</button>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}<button className="text-button" onClick={load}>Retry</button></div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {loading ? <div className="case-table-loading">Loading Cases…</div> : data.items?.length ? <div className="case-table-scroll">
        <table className="case-table"><thead><tr>
          <th><button onClick={() => applySort('companyName')}>Case / Company</button></th><th>Industry</th><th>Status</th><th>Owner</th>
          <th><button onClick={() => applySort('openTickets')}>Open</button></th><th><button onClick={() => applySort('totalTickets')}>Total</button></th>
          <th><button onClick={() => applySort('acceptanceRate')}>Acceptance</button></th><th><button onClick={() => applySort('winRate')}>Win rate</button></th>
          <th><button onClick={() => applySort('lastInteraction')}>Last interaction</button></th><th>Health</th><th>Priority</th>{filters.archived==='only'&&<th>Action</th>}
        </tr></thead><tbody>{data.items.map((item) => <tr key={item.id} tabIndex={item.deletedAt ? undefined : 0} onClick={() => { if (!item.deletedAt) navigate(`/console/cases/${item.id}`) }} onKeyDown={(event) => { if (!item.deletedAt && event.key === 'Enter') navigate(`/console/cases/${item.id}`) }}>
          <td><strong>{item.displayName || item.companyName}</strong><small>CASE-{item.id.slice(0,8).toUpperCase()}</small></td><td>{item.industry || 'Not set'}</td>
          <td><span className="crm-badge">{item.status}</span><small>{String(item.lifecycleStage).replaceAll('_',' ')}</small></td><td>{item.ownerName || 'Unassigned'}</td>
          <td>{item.metrics?.openTickets ?? 0}</td><td>{item.metrics?.totalTickets ?? 0}</td><td>{formatRate(item.metrics?.acceptanceRate)}</td><td>{formatRate(item.metrics?.winRate)}</td>
          <td>{formatDateTime(item.metrics?.lastInteraction)}</td><td><Health value={item.health}/></td><td><span className={`priority-label priority-${item.priority}`}>{item.priority}</span></td>{filters.archived==='only'&&<td><button className="button button-secondary button-small" onClick={(event)=>{event.stopPropagation();restore(item.id)}}>Restore</button></td>}
        </tr>)}</tbody></table>
      </div> : <div className="case-empty"><Icon name="briefcase" size={30}/><h2>No Cases have been created yet.</h2><p>Cases are created automatically when the first Ticket for a company is created.</p></div>}
      <footer className="case-pagination"><span>{data.total ?? 0} Case{data.total === 1 ? '' : 's'}</span><div><button className="button button-secondary button-small" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="button button-secondary button-small" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer>
    </section>
  </div>
}
