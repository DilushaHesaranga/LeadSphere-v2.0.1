import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icons.jsx'
import { DEPARTMENTS } from '../config/crm.js'
import {
  DASHBOARD_PRESETS, dashboardCount, dashboardMoney, dashboardRange, dashboardRangeError,
  dashboardSalesMonths, dashboardSalesValue, defaultDashboardFilters, parseDashboardFilters,
  refreshDashboardFilters, serializeDashboardFilters,
} from '../config/dashboard.js'
import { reportDateLabel, todayInReportTimezone } from '../config/reports.js'
import { formatDealValue } from '../config/ticketSales.js'
import { dashboardService } from '../services/dashboardService.js'
import { navigate } from '../utils/router.js'
import './DashboardPage.css'

const CARDS = [
  { key: 'totalTickets', label: 'Total tickets', kind: 'all', icon: 'file', hint: 'All current, unarchived tickets', tone: 'neutral' },
  { key: 'pendingTickets', label: 'Pending tickets', kind: 'pending', icon: 'activity', hint: 'Active tickets in open stages', tone: 'blue' },
  { key: 'closedTickets', label: 'Closed tickets', kind: 'closed', icon: 'lock', hint: 'Marked closed in this period', tone: 'neutral' },
  { key: 'wonTickets', label: 'Won deals', kind: 'won', icon: 'check', hint: 'Won in this period', tone: 'green' },
  { key: 'lostTickets', label: 'Lost deals', kind: 'lost', icon: 'archive', hint: 'Lost in this period', tone: 'red' },
]

function PanelHeading({ kicker, title, children }) {
  return <header className="crm-dashboard-panel-heading"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div>{children}</header>
}

function DashboardFilters({ filters, options, onApply }) {
  const [draft, setDraft] = useState(filters)
  const [error, setError] = useState('')
  const today = todayInReportTimezone()
  useEffect(() => { setDraft(filters); setError('') }, [filters])
  const set = (key, value) => { setDraft((current) => ({ ...current, [key]: value })); setError('') }
  const submit = (event) => {
    event.preventDefault()
    const message = dashboardRangeError(draft.from, draft.to, today)
    if (message) return setError(message)
    onApply(draft)
  }
  return <form className="crm-dashboard-filters" onSubmit={submit} aria-label="Dashboard filters" noValidate>
    <div className="crm-dashboard-filter-fields">
      <label className="field"><span>Date range</span><select value={draft.preset} onChange={(event) => {
        const preset = event.target.value
        setDraft({ ...draft, preset, ...(preset === 'custom' ? {} : dashboardRange(preset, today)) }); setError('')
      }}>{DASHBOARD_PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="field"><span>Department</span><select value={draft.department} onChange={(event) => set('department', event.target.value)}><option value="">All departments</option>{DEPARTMENTS.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="field"><span>Pipeline</span><select value={draft.pipelineId} onChange={(event) => set('pipelineId', event.target.value)}><option value="">All pipelines</option>{(options.pipelines ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>Owner or assignee</span><select value={draft.ownerId} onChange={(event) => set('ownerId', event.target.value)}><option value="">Everyone in scope</option>{(options.owners ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button type="submit" className="button button-primary">Apply filters</button>
    </div>
    {draft.preset === 'custom' && <div className="crm-dashboard-custom-dates"><label className="field"><span>From</span><input type="date" value={draft.from} max={draft.to} onChange={(event) => set('from', event.target.value)}/></label><label className="field"><span>To</span><input type="date" value={draft.to} min={draft.from} max={today} onChange={(event) => set('to', event.target.value)}/></label></div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="crm-dashboard-filter-note"><span><Icon name="calendar" size={14}/>{reportDateLabel(filters.from, filters.to)} · Asia/Colombo</span><button type="button" className="text-button" onClick={() => onApply(defaultDashboardFilters(today))}>Reset filters</button></div>
  </form>
}

function SalesSummary({ data, filters, onRecords }) {
  const [chosenCurrency, setChosenCurrency] = useState('')
  const currencies = [...new Set([...data.sales.map((item) => item.currency), ...data.salesTrend.map((item) => item.currency)])].sort()
  if (!currencies.length) currencies.push('LKR')
  const populated = data.sales.filter((item) => item.wonWithValue || item.pipelineWithValue)
  const defaultCurrency = populated.find((item) => item.currency === 'LKR')?.currency ?? populated[0]?.currency ?? 'LKR'
  const currency = currencies.includes(chosenCurrency) ? chosenCurrency : currencies.includes(defaultCurrency) ? defaultCurrency : currencies[0]
  const sales = data.sales.find((item) => item.currency === currency)
  const coverage = data.salesCoverage
  const months = dashboardSalesMonths(data.salesTrend, currency, filters.from, filters.to)
  const maximum = Math.max(1, ...months.map((item) => Number(item.wonValue)))
  return <section className="crm-dashboard-panel crm-dashboard-sales">
    <PanelHeading kicker="Sales performance" title="Recorded sales"><label className="crm-dashboard-currency"><span className="sr-only">Sales currency</span><select value={currency} onChange={(event) => setChosenCurrency(event.target.value)}>{currencies.map((item) => <option key={item}>{item}</option>)}</select></label></PanelHeading>
    <div className="crm-dashboard-sales-totals">
      <button type="button" onClick={() => onRecords({ kind: 'won', title: 'Won deals · all currencies' })}><span>Won deal value · selected period</span><strong>{coverage.wonTickets ? dashboardSalesValue(sales, currency, 'won') : 'No won deals'}</strong><small>{dashboardCount(sales?.wonWithValue ?? 0)} won deals with a value in {currency}</small><small>View all won deals<Icon name="arrow" size={14}/></small></button>
      <button type="button" onClick={() => onRecords({ kind: 'pending', title: 'Pending tickets · all currencies' })}><span>Open pipeline value · now</span><strong>{coverage.pipelineTickets ? dashboardSalesValue(sales, currency, 'pipeline') : 'No pending tickets'}</strong><small>Potential value of {dashboardCount(sales?.pipelineWithValue ?? 0)} pending tickets</small><small>View all pending tickets<Icon name="arrow" size={14}/></small></button>
    </div>
    <div className="crm-dashboard-sales-chart" aria-label={`Monthly won deal values in ${currency}`}>
      {months.map((item) => <div key={item.month} className="crm-dashboard-sales-month">
        <span>{item.withValue ? dashboardMoney(item.wonValue, currency) : item.wonCount ? 'Not recorded' : '—'}</span>
        <div className="crm-dashboard-bar-track"><i style={{ height: `${Number(item.wonValue) / maximum * 100}%` }}/></div>
        <time dateTime={item.month}>{new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${item.month.slice(0, 10)}T00:00:00Z`))}</time>
      </div>)}
    </div>
    <p className="crm-dashboard-note">Based on the currently recorded value of deals won in the selected dates. These figures are deal values, not payments received. Currencies are shown separately.</p>
    {(coverage.wonMissingValue > 0 || coverage.pipelineMissingValue > 0) && <div className="crm-dashboard-coverage"><Icon name="edit" size={16}/><span>{dashboardCount(coverage.wonMissingValue)} won deals and {dashboardCount(coverage.pipelineMissingValue)} pending tickets have no deal value. Add it in Ticket details → Overview.</span></div>}
  </section>
}

function PipelineSummary({ stages, onRecords }) {
  const total = stages.reduce((sum, item) => sum + Number(item.count), 0)
  const maximum = Math.max(1, ...stages.map((item) => Number(item.count)))
  return <section className="crm-dashboard-panel">
    <PanelHeading kicker="Current position" title="Tickets by stage"><span className="crm-dashboard-panel-meta">{dashboardCount(total)} tickets</span></PanelHeading>
    <div className="crm-dashboard-pipeline">
      {stages.map((item) => <button type="button" key={item.stage} className={`crm-dashboard-stage ${item.category}`} onClick={() => onRecords({ kind: 'stage', stage: item.stage, title: item.stageName })}>
        <span><strong>{item.stageName}</strong><small>{item.pipelineName}{item.category === 'open' && item.count > 0 ? ` · ${Number(item.averageAgeDays).toFixed(1)} avg days in stage` : ''}</small></span>
        <span className="crm-dashboard-stage-track"><i style={{ width: `${Number(item.count) / maximum * 100}%` }}/></span><b>{dashboardCount(item.count)}</b>
      </button>)}
      {!stages.length && <p className="compact-empty">No tickets match these filters.</p>}
    </div>
    <p className="crm-dashboard-note">Current stage of all unarchived tickets, including won and lost outcomes.</p>
  </section>
}

function FollowUpSummary({ data, onRecords, mayReadTickets }) {
  const now = new Date(data.asOf).getTime()
  return <section className="crm-dashboard-panel">
    <PanelHeading kicker="Next actions" title="Follow-ups"><span className="crm-dashboard-panel-meta">Current schedule</span></PanelHeading>
    <div className="crm-dashboard-followup-counts">
      <button type="button" className="overdue" onClick={() => onRecords({ kind: 'overdue', title: 'Tickets with overdue follow-ups' })}><strong>{dashboardCount(data.metrics.overdueFollowUps)}</strong><span>Overdue</span></button>
      <div><strong>{dashboardCount(data.metrics.dueTodayFollowUps)}</strong><span>Due today</span></div>
      <div><strong>{dashboardCount(data.metrics.upcomingFollowUps)}</strong><span>Upcoming</span></div>
      <div><strong>{dashboardCount(data.metrics.completedFollowUps)}</strong><span>Completed in period</span></div>
    </div>
    <p className="crm-dashboard-note">Due today includes overdue items from today. Upcoming starts tomorrow.</p>
    <div className="crm-dashboard-followups">
      {data.followUps.map((item) => <article key={item.id}>
        <span className={`crm-dashboard-followup-icon ${new Date(item.scheduledAt).getTime() < now ? 'overdue' : ''}`}><Icon name={item.type === 'EMAIL' ? 'mail' : item.type === 'CALL' ? 'phone' : 'calendar'} size={17}/></span>
        <div>{mayReadTickets ? <button type="button" className="inline-link" onClick={() => navigate(`/console/tickets/${item.ticketId}`)}>{item.projectTitle}</button> : <strong>{item.projectTitle}</strong>}<span>{item.companyName} · {item.type.toLowerCase().replaceAll('_', ' ')}</span>{item.purpose && <p>{item.purpose}</p>}<time dateTime={item.scheduledAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: data.timezone }).format(new Date(item.scheduledAt))}</time></div>
      </article>)}
      {!data.followUps.length && <p className="compact-empty">No pending follow-ups for these filters.</p>}
    </div>
  </section>
}

function TeamSummary({ data, onRecords }) {
  return <section className="crm-dashboard-panel">
    <PanelHeading kicker="Team performance" title="Work by manager"/>
    <div className="crm-dashboard-table-wrap"><table className="crm-dashboard-table"><thead><tr><th scope="col">Manager</th><th scope="col">Pending now</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col">Closed</th></tr></thead><tbody>{data.team.map((item) => <tr key={item.managerId}><th scope="row">{item.managerName}</th><td>{dashboardCount(item.pending)}</td><td className="crm-dashboard-positive">{dashboardCount(item.won)}</td><td>{dashboardCount(item.lost)}</td><td>{dashboardCount(item.closed)}</td></tr>)}</tbody></table>{!data.team.length && <p className="compact-empty">No manager results for these filters.</p>}</div>
    <p className="crm-dashboard-note">Each ticket is counted once under its current responsible manager. Won, lost, and closed use the selected period.</p>
    <div className="crm-dashboard-departments">{data.departments.map((item) => <button type="button" key={item.department} onClick={() => onRecords({ kind: 'all', department: item.department, title: `${item.label} tickets` })}><span>{item.label}</span><strong>{dashboardCount(item.total)}</strong><small>{dashboardCount(item.pending)} pending</small></button>)}</div>
  </section>
}

function DashboardRecords({ filters, selection, mayReadTickets, onClose, refreshVersion }) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const headingRef = useRef(null)
  const scopedFilters = useMemo(() => ({ ...filters, ...(selection.department ? { department: selection.department } : {}) }), [filters, selection.department])
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); headingRef.current?.scrollIntoView({ block: 'start' }) }, [])
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setResult(null)
    dashboardService.listRecords(scopedFilters, { ...selection, page }).then((data) => { if (active) setResult(data) }).catch((loadError) => { if (active) setError(loadError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [scopedFilters, selection, page, retry, refreshVersion])
  const pages = Math.max(1, Math.ceil(Number(result?.total ?? 0) / Number(result?.pageSize || 10)))
  return <section className="crm-dashboard-panel crm-dashboard-records" aria-labelledby="dashboard-records-title">
    <header className="crm-dashboard-panel-heading"><div><span className="section-kicker">Supporting tickets</span><h2 id="dashboard-records-title" tabIndex={-1} ref={headingRef}>{selection.title}</h2></div><button type="button" className="icon-button" aria-label="Close supporting tickets" onClick={onClose}><Icon name="close"/></button></header>
    {loading && <p className="compact-empty" role="status">Loading tickets…</p>}
    {error && <div className="alert alert-error" role="alert"><span>{error}</span><button className="text-button" type="button" onClick={() => setRetry((value) => value + 1)}>Retry tickets</button></div>}
    {result && <><div className="crm-dashboard-table-wrap"><table className="crm-dashboard-table"><thead><tr><th scope="col">Ticket / company</th><th scope="col">Stage</th><th scope="col">Status</th><th scope="col">Manager</th><th scope="col">Deal value</th></tr></thead><tbody>{result.records.map((ticket) => <tr key={ticket.id}><td>{mayReadTickets ? <button type="button" className="inline-link" onClick={() => navigate(`/console/tickets/${ticket.id}`)}>{ticket.projectTitle}</button> : <strong>{ticket.projectTitle}</strong>}<small>{ticket.companyName}</small></td><td>{ticket.stageName}</td><td className="crm-dashboard-capitalize">{ticket.status}</td><td>{ticket.managerName}</td><td>{formatDealValue(ticket.dealValue, ticket.currency ?? 'LKR')}</td></tr>)}</tbody></table>{!result.records.length && <p className="compact-empty">No tickets match this view.</p>}</div><footer className="crm-dashboard-pagination"><span>{dashboardCount(result.total)} tickets · Page {page} of {pages}</span><div><button type="button" className="button button-secondary button-small" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" className="button button-secondary button-small" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer></>}
  </section>
}

export function DashboardPage({ profile, mayReadTickets = false, mayReadReports = false }) {
  const [filters, setFilters] = useState(() => parseDashboardFilters(window.location.search))
  const [options, setOptions] = useState({ pipelines: [], owners: [] })
  const [optionsError, setOptionsError] = useState('')
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [selection, setSelection] = useState(null)
  const refresh = useCallback(() => {
    const next = refreshDashboardFilters(filters)
    if (next !== filters) { setFilters(next); setSelection(null) }
    setRefreshVersion((value) => value + 1)
  }, [filters])
  useEffect(() => {
    const sync = () => { setFilters(parseDashboardFilters(window.location.search)); setSelection(null) }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('popstate', sync)
    document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('popstate', sync); document.removeEventListener('visibilitychange', visible) }
  }, [refresh])
  useEffect(() => {
    let active = true
    setOptionsError('')
    dashboardService.getFilterOptions().then((data) => { if (active) setOptions(data) }).catch(() => { if (active) setOptionsError('Pipeline and owner filters could not be loaded.') })
    return () => { active = false }
  }, [refreshVersion])
  useEffect(() => {
    let active = true
    setLoading(true); setOverview(null); setError('')
    dashboardService.getOverview(filters).then((data) => { if (active) setOverview(data) }).catch((loadError) => { if (active) setError(loadError.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, refreshVersion])
  const applyFilters = (next) => {
    setFilters(next); setSelection(null)
    window.history.replaceState({}, '', `/console/dashboard${serializeDashboardFilters(next)}`)
  }
  const openRecords = (next) => setSelection({ ...next })
  const metrics = overview?.metrics
  return <main className="console-content crm-dashboard">
    <header className="crm-dashboard-heading"><div><span className="section-kicker">Management overview</span><h1>CRM dashboard</h1><p>{profile?.display_name ? `${profile.display_name.split(' ')[0]}, here` : 'Here'} is where your tickets, sales, and next actions stand.</p></div><button type="button" className="button button-secondary" onClick={refresh} disabled={loading}><Icon name="activity" size={16}/>{loading ? 'Refreshing…' : 'Refresh dashboard'}</button></header>
    <DashboardFilters filters={filters} options={options} onApply={applyFilters}/>
    {optionsError && <div className="alert alert-error" role="alert"><span>{optionsError}</span><button type="button" className="text-button" onClick={refresh}>Retry filters</button></div>}
    {loading && <div className="crm-dashboard-loading" role="status" aria-label="Loading dashboard"><div/><div/><div/><p>Loading your dashboard…</p></div>}
    {error && <div className="crm-dashboard-error" role="alert"><Icon name="chart" size={30}/><h2>Dashboard unavailable</h2><p>{error}</p><button type="button" className="button button-primary" onClick={refresh}>Retry dashboard</button></div>}
    {!loading && overview && <>
      <div className="crm-dashboard-context"><span><i/>Updated {new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: overview.timezone }).format(new Date(overview.asOf))} · Only tickets within your access</span><button type="button" className="text-button" onClick={() => openRecords({ kind: 'new', title: 'New tickets' })}>{dashboardCount(metrics.newTickets)} new tickets in this period <Icon name="arrow" size={14}/></button></div>
      <section className="crm-dashboard-metrics" aria-label="Ticket summary">
        {CARDS.map((item) => <button type="button" key={item.key} className={`crm-dashboard-metric ${item.tone}`} onClick={() => openRecords({ kind: item.kind, title: item.label })}><span><Icon name={item.icon} size={17}/>{item.label}</span><strong>{dashboardCount(metrics[item.key])}</strong><small>{item.hint}</small><Icon name="arrow" size={14}/></button>)}
        <article className="crm-dashboard-metric green"><span><Icon name="chart" size={17}/>Win rate</span><strong>{metrics.winRate == null ? '—' : `${Number(metrics.winRate).toFixed(1)}%`}</strong><small>{metrics.winRate == null ? 'No won or lost deals in period' : 'Won ÷ (won + lost) in period'}</small></article>
      </section>
      <section className="crm-dashboard-attention" aria-label="Tickets needing attention"><div><Icon name="bell" size={18}/><strong>Needs attention</strong></div><button type="button" onClick={() => openRecords({ kind: 'overdue', title: 'Tickets with overdue follow-ups' })}><b>{dashboardCount(metrics.overdueFollowUps)}</b> overdue follow-ups <Icon name="arrow" size={13}/></button><button type="button" onClick={() => openRecords({ kind: 'stale', title: 'Pending tickets in the same stage for 14+ days' })}><b>{dashboardCount(metrics.staleTickets)}</b> pending 14+ days in stage <Icon name="arrow" size={13}/></button><button type="button" onClick={() => openRecords({ kind: 'unassigned', title: 'Pending tickets without assignees' })}><b>{dashboardCount(metrics.unassignedTickets)}</b> without assignees <Icon name="arrow" size={13}/></button></section>
      {metrics.totalTickets === 0 && <p className="crm-dashboard-empty" role="status">No tickets match these filters. Try another department or owner, or add your first ticket from Cases.</p>}
      <div className="crm-dashboard-grid"><SalesSummary data={overview} filters={filters} onRecords={openRecords}/><PipelineSummary stages={overview.pipeline} onRecords={openRecords}/><FollowUpSummary data={overview} onRecords={openRecords} mayReadTickets={mayReadTickets}/><TeamSummary data={overview} onRecords={openRecords}/></div>
      {selection && <DashboardRecords key={JSON.stringify(selection)} filters={filters} selection={selection} refreshVersion={refreshVersion} mayReadTickets={mayReadTickets} onClose={() => setSelection(null)}/>}
      <footer className="crm-dashboard-footer"><span>Pending, pipeline, and attention figures show current work. Results use the selected dates and each ticket’s current outcome. Closed is an operational status; won is a sales outcome.</span>{mayReadReports && <button type="button" className="text-button" onClick={() => navigate('/console/reports')}>Open Reports &amp; Insights <Icon name="arrow" size={15}/></button>}</footer>
    </>}
  </main>
}
