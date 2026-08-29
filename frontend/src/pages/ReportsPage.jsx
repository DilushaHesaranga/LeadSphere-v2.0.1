import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icons.jsx'
import {
  FollowUpHealthChart, OutcomeChart, PipelineFunnel, ReportFilterBar,
  ReportInsights, ReportMetricDefinitions, ReportMetricGrid, ReportSkeleton,
  TeamPerformanceTable, TicketVolumeChart,
} from '../components/ReportsWorkspace.jsx'
import {
  defaultReportFilters, parseReportFilters, REPORT_CATALOG, REPORT_CATEGORIES,
  serializeReportFilters, todayInReportTimezone,
} from '../config/reports.js'
import { reportService } from '../services/reportService.js'
import { navigate } from '../utils/router.js'

function ReportsNavigation({ active }) {
  return <nav className="reports-tabs" aria-label="Reports sections">
    <button type="button" className={active === 'overview' ? 'active' : ''} aria-current={active === 'overview' ? 'page' : undefined} onClick={() => navigate('/console/reports')}>Overview</button>
    <button type="button" className={active === 'library' ? 'active' : ''} aria-current={active === 'library' ? 'page' : undefined} onClick={() => navigate('/console/reports/library')}>Reports Library</button>
  </nav>
}

function ReportsLibrary({ filters }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const reports = useMemo(() => REPORT_CATALOG.filter((report) => {
    const matchesCategory = !category || report.category === category
    const words = `${report.name} ${report.description}`.toLowerCase()
    return matchesCategory && words.includes(search.trim().toLowerCase())
  }), [category, search])

  return <>
    <section className="report-library-tools" aria-label="Filter reports library">
      <label className="report-library-search"><Icon name="search" size={17}/><span className="sr-only">Search reports</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search standard reports"/></label>
      <label><span className="sr-only">Report category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{REPORT_CATEGORIES.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}</select></label>
    </section>
    <section className="report-library-grid" aria-live="polite">
      {reports.map((report) => <article key={report.key} className="report-library-card">
        <span className={`report-library-icon ${report.category}`}><Icon name="chart"/></span>
        <small>{REPORT_CATEGORIES.find((item) => item.value === report.category)?.label}</small>
        <h2>{report.name}</h2>
        <p>{report.description}</p>
        <button type="button" className="text-button" onClick={() => navigate(`/console/reports/${report.key}${serializeReportFilters(filters)}`)}>Open report <Icon name="arrow" size={15}/></button>
      </article>)}
      {!reports.length && <div className="report-library-empty"><Icon name="search" size={25}/><h2>No reports match this search.</h2><p>Clear the search or choose another category.</p></div>}
    </section>
  </>
}

export function ReportsPage({ view = 'overview' }) {
  const today = useMemo(() => todayInReportTimezone(), [])
  const [filters, setFilters] = useState(() => parseReportFilters(window.location.search, today))
  const [options, setOptions] = useState({ timezone: 'Asia/Colombo', pipelines: [], stages: [], owners: [], today })
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(view === 'overview')
  const [error, setError] = useState('')
  const sequence = useRef(0)

  useEffect(() => {
    let active = true
    reportService.getFilterOptions().then((result) => {
      if (active) setOptions({ ...result, today })
    }).catch((loadError) => { if (active) setError(loadError.message) })
    return () => { active = false }
  }, [today])

  const loadOverview = useCallback(async () => {
    if (view !== 'overview') return
    const request = ++sequence.current
    setLoading(true); setError(''); setOverview(null)
    try {
      const result = await reportService.getOverview(filters)
      if (request === sequence.current) setOverview(result)
    } catch (loadError) {
      if (request === sequence.current) setError(loadError.message)
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [filters, view])

  useEffect(() => { loadOverview() }, [loadOverview])

  const updateFilters = (next) => {
    setFilters(next)
    window.history.replaceState({}, '', `${view === 'library' ? '/console/reports/library' : '/console/reports'}${serializeReportFilters(next)}`)
  }
  const openReport = (reportKey, overrides = {}) => navigate(`/console/reports/${reportKey}${serializeReportFilters({ ...filters, ...overrides })}`)
  const clearFilters = () => updateFilters(defaultReportFilters(today))

  return <main className="console-content reports-page">
    <header className="reports-heading">
      <div><span className="section-kicker">Decision-ready CRM reporting</span><h1>Reports &amp; Insights</h1><p>Understand Ticket creation, conversion, pipeline health, outcomes, team contribution, activity, and Follow Up risk using only data in your authorised scope.</p></div>
      <button type="button" className="button button-secondary" onClick={() => navigate('/console/reports/library')}><Icon name="chart" size={17}/> Browse reports</button>
    </header>
    <ReportsNavigation active={view}/>
    {view === 'library' ? <ReportsLibrary filters={filters}/> : <>
      <ReportFilterBar filters={filters} options={options} onChange={updateFilters} onClear={clearFilters}/>
      {error && <div className="alert alert-error report-alert"><span>{error}</span><button type="button" className="text-button" onClick={loadOverview}>Retry</button></div>}
      {loading ? <ReportSkeleton/> : overview && <>
        <ReportMetricGrid metrics={overview.metrics} onOpenReport={openReport}/>
        <section className="report-dashboard-grid">
          <TicketVolumeChart series={overview.charts?.ticketVolume} onDrillDown={openReport}/>
          <PipelineFunnel stages={overview.charts?.pipelineStages} summary={overview.pipelineHealth} asOf={overview.period?.to} onDrillDown={openReport}/>
          <OutcomeChart series={overview.charts?.outcomes} onDrillDown={openReport}/>
          <FollowUpHealthChart series={overview.charts?.followUps} onDrillDown={openReport}/>
          <TeamPerformanceTable items={overview.charts?.teamPerformance} onDrillDown={openReport}/>
        </section>
        <ReportInsights insights={overview.insights} onDrillDown={openReport}/>
        <ReportMetricDefinitions definitions={overview.definitions}/>
      </>}
      {!loading && !error && !overview && <div className="report-page-empty"><h2>No report summary is available.</h2><p>Try another date range or reload the page.</p></div>}
    </>}
  </main>
}
