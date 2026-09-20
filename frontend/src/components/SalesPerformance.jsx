import { useCallback, useEffect, useState } from 'react'
import { DashboardFilters, DashboardRecords, SalesSummary } from './DashboardPanels.jsx'
import { parseSalesPerformanceFilters, defaultSalesPerformanceFilters, refreshDashboardFilters, serializeDashboardFilters } from '../config/dashboard.js'
import { dashboardService } from '../services/dashboardService.js'

export function SalesPerformance({ mayReadTickets }) {
  const [filters, setFilters] = useState(() => parseSalesPerformanceFilters(window.location.search))
  const [options, setOptions] = useState({ pipelines: [], owners: [] })
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const [selection, setSelection] = useState(null)
  const refresh = useCallback(() => {
    setFilters((current) => refreshDashboardFilters(current))
    setVersion((current) => current + 1)
  }, [])
  useEffect(() => {
    const sync = () => { setFilters(parseSalesPerformanceFilters(window.location.search)); setSelection(null) }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('popstate', sync)
    document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('popstate', sync); document.removeEventListener('visibilitychange', visible) }
  }, [refresh])
  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setData(null)
    Promise.all([dashboardService.getOverview(filters), dashboardService.getFilterOptions()])
      .then(([overview, choices]) => { if (active) { setData(overview); setOptions(choices) } })
      .catch((failure) => { if (active) setError(failure.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, version])
  const apply = (next) => {
    setFilters(next); setSelection(null)
    window.history.replaceState({}, '', `/console/reports/sales${serializeDashboardFilters(next)}`)
  }
  return <section aria-label="Sales performance">
    <header className="crm-dashboard-panel-heading"><div><h2>Sales performance</h2><p>Recorded won deal values and the current open pipeline, within your authorised scope.</p></div><button type="button" className="button button-secondary" onClick={refresh} disabled={loading}>Refresh sales</button></header>
    <DashboardFilters filters={filters} options={options} onApply={apply} resetFilters={defaultSalesPerformanceFilters}/>
    {loading && <p role="status">Loading sales performance…</p>}
    {error && <div className="alert alert-error" role="alert">{error}<button type="button" className="text-button" onClick={refresh}>Retry sales</button></div>}
    {data && <><div className="crm-dashboard-context"><span>Updated {new Date(data.asOf).toLocaleString()} · Only tickets within your access</span></div><SalesSummary data={data} filters={filters} onRecords={setSelection}/></>}
    {data && selection && <DashboardRecords key={JSON.stringify([selection, filters])} filters={filters} selection={selection} refreshVersion={version} mayReadTickets={mayReadTickets} onClose={() => setSelection(null)}/>}
  </section>
}
