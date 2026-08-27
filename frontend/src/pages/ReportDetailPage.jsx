import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icons.jsx'
import {
  FollowUpHealthChart, OutcomeChart, PipelineFunnel, ReportComparisonChart,
  ReportFilterBar, ReportSkeleton, TeamPerformanceTable, TicketVolumeChart,
} from '../components/ReportsWorkspace.jsx'
import {
  defaultReportFilters, parseReportFilters, recordsToCsv, reportByKey,
  reportFilename, REPORT_SORTS, REPORT_TIMEZONE, serializeReportFilters,
  todayInReportTimezone,
} from '../config/reports.js'
import { reportService } from '../services/reportService.js'
import { navigate } from '../utils/router.js'

const PAGE_SIZE = 25

function formatCell(value, format) {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ') || '—'
  if (format === 'datetime') return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: REPORT_TIMEZONE,
  }).format(new Date(value))
  if (format === 'activity') return String(value).replaceAll('_', ' ').toLowerCase().replace(/^./, (character) => character.toUpperCase())
  return String(value)
}

function DetailChart({ report, overview, onDrillDown }) {
  if (!overview) return null
  if (report.chart === 'volume') {
    if (report.key === 'activity-summary') return <ReportComparisonChart kicker="Activity trend" title="Recorded CRM activity" current={overview.metrics?.activitiesRecorded?.value} previous={overview.metrics?.activitiesRecorded?.previous}/>
    return <TicketVolumeChart series={overview.charts?.ticketVolume} onDrillDown={onDrillDown}/>
  }
  if (report.chart === 'conversion') return <ReportComparisonChart kicker="Cohort conversion" title="Converted Tickets" current={overview.metrics?.convertedTickets?.value} previous={overview.metrics?.convertedTickets?.previous}/>
  if (report.chart === 'pipeline') return <PipelineFunnel stages={overview.charts?.pipelineStages} onDrillDown={onDrillDown}/>
  if (report.chart === 'outcomes') return <OutcomeChart series={overview.charts?.outcomes} onDrillDown={onDrillDown}/>
  if (report.chart === 'followups') return <FollowUpHealthChart series={overview.charts?.followUps} onDrillDown={onDrillDown}/>
  if (report.chart === 'team') return <TeamPerformanceTable items={overview.charts?.teamPerformance} onDrillDown={onDrillDown}/>
  return null
}

function ReportRecordsTable({ result, onOpenTicket }) {
  const columns = result?.columns ?? []
  const items = result?.items ?? []
  return <section className="report-records-panel" aria-labelledby="report-records-title">
    <header><div><span className="section-kicker">Underlying records</span><h2 id="report-records-title">Report data</h2></div><span>{result?.total ?? 0} matching records</span></header>
    {items.length ? <div className="report-table-scroll"><table className="report-records-table"><thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={`${item.recordType}-${item.id}`} onClick={() => onOpenTicket(item.ticketId)}>{columns.map((column, index) => <td key={column.key}>{index === 0 ? <button type="button" className="report-record-link" onClick={(event) => { event.stopPropagation(); onOpenTicket(item.ticketId) }}>#{formatCell(item[column.key], column.format)}</button> : column.format === 'status' ? <span className={`report-status report-status-${String(item[column.key] ?? '').toLowerCase()}`}>{formatCell(item[column.key], column.format)}</span> : formatCell(item[column.key], column.format)}</td>)}</tr>)}</tbody></table></div> : <div className="report-records-empty"><Icon name="chart" size={27}/><h3>No records match this report.</h3><p>Try widening the date range or clearing one of the filters.</p></div>}
  </section>
}

export function ReportDetailPage({ reportKey }) {
  const report = useMemo(() => reportByKey(reportKey), [reportKey])
  const today = useMemo(() => todayInReportTimezone(), [])
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), [])
  const [filters, setFilters] = useState(() => parseReportFilters(window.location.search, today))
  const [sort, setSort] = useState(() => REPORT_SORTS.some((item) => item.value === initialQuery.get('sort')) ? initialQuery.get('sort') : 'recent')
  const [page, setPage] = useState(() => Math.max(1, Number.parseInt(initialQuery.get('page') ?? '1', 10) || 1))
  const [options, setOptions] = useState({ timezone: REPORT_TIMEZONE, pipelines: [], stages: [], owners: [], today })
  const [overview, setOverview] = useState(null)
  const [records, setRecords] = useState(null)
  const [loading, setLoading] = useState(Boolean(report))
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const sequence = useRef(0)

  const direction = sort === 'oldest' || sort === 'company' || sort === 'stage' ? 'asc' : 'desc'
  const syncUrl = useCallback((nextFilters, nextSort, nextPage) => {
    const base = serializeReportFilters(nextFilters)
    const params = new URLSearchParams(base.slice(1))
    if (nextSort !== 'recent') params.set('sort', nextSort)
    if (nextPage > 1) params.set('page', String(nextPage))
    const query = params.toString()
    window.history.replaceState({}, '', `/console/reports/${reportKey}${query ? `?${query}` : ''}`)
  }, [reportKey])

  useEffect(() => {
    let active = true
    if (!report) return undefined
    reportService.getFilterOptions().then((result) => { if (active) setOptions({ ...result, today }) }).catch((loadError) => { if (active) setError(loadError.message) })
    return () => { active = false }
  }, [report, today])

  const loadReport = useCallback(async () => {
    if (!report) return
    const request = ++sequence.current
    setLoading(true); setError(''); setOverview(null); setRecords(null)
    try {
      const [summary, detail] = await Promise.all([
        reportService.getOverview(filters),
        reportService.listRecords({ reportKey, filters, sort, direction, page, pageSize: PAGE_SIZE }),
      ])
      if (request === sequence.current) { setOverview(summary); setRecords(detail) }
    } catch (loadError) {
      if (request === sequence.current) setError(loadError.message)
    } finally {
      if (request === sequence.current) setLoading(false)
    }
  }, [direction, filters, page, report, reportKey, sort])

  useEffect(() => { loadReport() }, [loadReport])

  if (!report) return <main className="console-content reports-page"><div className="report-page-empty"><Icon name="chart" size={28}/><h1>Report not found</h1><p>This standard report does not exist.</p><button type="button" className="button button-primary" onClick={() => navigate('/console/reports/library')}>Open Reports Library</button></div></main>

  const updateFilters = (next) => { setFilters(next); setPage(1); syncUrl(next, sort, 1) }
  const updateSort = (next) => { setSort(next); setPage(1); syncUrl(filters, next, 1) }
  const updatePage = (next) => { setPage(next); syncUrl(filters, sort, next); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const openDrillDown = (key, overrides = {}) => navigate(`/console/reports/${key}${serializeReportFilters({ ...filters, ...overrides })}`)

  const exportCsv = async () => {
    if (exporting) return
    setExporting(true); setExportMessage('')
    try {
      const allItems = []
      let exportPage = 1
      let response
      do {
        response = await reportService.listRecords({ reportKey, filters, sort, direction, page: exportPage, pageSize: 200 })
        allItems.push(...(response.items ?? []))
        exportPage += 1
      } while (exportPage <= response.pageCount)
      const blob = new Blob([recordsToCsv(response.columns ?? [], allItems)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = reportFilename(report.name, filters.from, filters.to); document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setExportMessage(`${allItems.length} authorised records exported.`)
    } catch (exportError) { setError(exportError.message) } finally { setExporting(false) }
  }

  return <main className="console-content reports-page report-detail-page">
    <button type="button" className="report-back-link" onClick={() => navigate(`/console/reports/library${serializeReportFilters(filters)}`)}>← Reports Library</button>
    <header className="reports-heading report-detail-heading"><div><span className="section-kicker">Standard report</span><h1>{report.name}</h1><p>{report.description}</p></div><button type="button" className="button button-primary" onClick={exportCsv} disabled={exporting || loading || !records}><Icon name="download" size={17}/>{exporting ? 'Preparing CSV…' : 'Export CSV'}</button></header>
    <ReportFilterBar filters={filters} options={options} onChange={updateFilters} onClear={() => updateFilters(defaultReportFilters(today))}/>
    <div className="report-detail-toolbar"><label><span>Sort records</span><select value={sort} onChange={(event) => updateSort(event.target.value)}>{REPORT_SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><span>Timezone: {overview?.timezone ?? options.timezone}</span></div>
    {exportMessage && <div className="alert alert-success report-alert">{exportMessage}</div>}
    {error && <div className="alert alert-error report-alert"><span>{error}</span><button type="button" className="text-button" onClick={loadReport}>Retry</button></div>}
    {loading ? <ReportSkeleton/> : !error && records && <>
      <div className="report-detail-chart"><DetailChart report={report} overview={overview} onDrillDown={openDrillDown}/></div>
      <ReportRecordsTable result={records} onOpenTicket={(ticketId) => navigate(`/console/tickets/${ticketId}`)}/>
      {(records?.pageCount ?? 0) > 1 && <nav className="report-pagination" aria-label="Report data pages"><button type="button" className="button button-secondary" disabled={page <= 1} onClick={() => updatePage(page - 1)}>Previous</button><span>Page <strong>{page}</strong> of {records.pageCount}</span><button type="button" className="button button-secondary" disabled={page >= records.pageCount} onClick={() => updatePage(page + 1)}>Next</button></nav>}
    </>}
  </main>
}
