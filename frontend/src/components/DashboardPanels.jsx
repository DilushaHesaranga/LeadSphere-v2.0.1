import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'
import { DEPARTMENTS } from '../config/crm.js'
import { DASHBOARD_PRESETS, dashboardCount, dashboardMoney, dashboardRange, dashboardRangeError, dashboardSalesMonths, dashboardSalesValue, defaultDashboardFilters } from '../config/dashboard.js'
import { reportDateLabel, todayInReportTimezone } from '../config/reports.js'
import { formatDealValue } from '../config/ticketSales.js'
import { dashboardService } from '../services/dashboardService.js'
import { navigate } from '../utils/router.js'
import '../pages/DashboardPage.css'

function PanelHeading({ kicker, title, children }) {
  return <header className="crm-dashboard-panel-heading"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div>{children}</header>
}

export function DashboardFilters({ filters, options, onApply, resetFilters = defaultDashboardFilters }) {
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
    <div className="crm-dashboard-filter-note"><span><Icon name="calendar" size={14}/>{reportDateLabel(filters.from, filters.to)} · Asia/Colombo</span><button type="button" className="text-button" onClick={() => onApply(resetFilters(today))}>Reset filters</button></div>
  </form>
}


export function SalesSummary({ data, filters, onRecords }) {
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
    <p className="crm-dashboard-note">{dashboardCount(data.metrics.currentWonTickets)} tickets currently in Won · {dashboardCount(coverage.wonTickets)} won in the selected dates. The selected dates apply to when tickets were won.</p>
    <div className="crm-dashboard-sales-totals">
      <button type="button" onClick={() => onRecords({ kind: 'won', title: 'Won deals · all currencies' })}><span>Won deal value · selected period</span><strong>{coverage.wonTickets ? dashboardSalesValue(sales, currency, 'won') : 'No wins in selected dates'}</strong><small>{dashboardCount(sales?.wonWithValue ?? 0)} won deals with a value in {currency}</small><small>View all won deals<Icon name="arrow" size={14}/></small></button>
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


export function DashboardRecords({ filters, selection, mayReadTickets, onClose, refreshVersion }) {
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

