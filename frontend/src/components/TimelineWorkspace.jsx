import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDateTime } from '../config/crm.js'
import {
  formatDuration, humanizeTimelineType, TIMELINE_CATEGORIES, TIMELINE_PRESETS,
  timelineBucketLabel, timelineGrouping, timelinePresetRange, timelineRangeIsValid, toggleTimelineCategory,
} from '../config/timeline.js'
import { timelineService } from '../services/timelineService.js'
import { navigate } from '../utils/router.js'
import { Icon } from './Icons.jsx'
import { TimelineChart } from './TimelineChart.jsx'

const emptyOptions = { departments: [], stages: [], managers: [], statuses: [], activityTypes: [] }

function CategoryFilters({ selected, onChange }) {
  return <fieldset className="timeline-category-filters"><legend>Show categories</legend>{TIMELINE_CATEGORIES.map((category) => <label key={category.value} className={`timeline-category ${category.value}`}><input type="checkbox" checked={selected.includes(category.value)} onChange={() => onChange(category.value)}/><i>{category.symbol}</i><span>{category.label}</span></label>)}</fieldset>
}

function DateRangeFilter({ preset, from, to, grouping, onPreset, onDate }) {
  return <div className="timeline-range-controls">
    <label className="field"><span>Date range</span><select value={preset} onChange={(event) => onPreset(event.target.value)}>{TIMELINE_PRESETS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
    {preset === 'custom' && <><label className="field"><span>From</span><input type="date" value={from} onChange={(event) => onDate('from', event.target.value)}/></label><label className="field"><span>To</span><input type="date" value={to} onChange={(event) => onDate('to', event.target.value)}/></label></>}
    <div className="timeline-grouping-note"><span>Grouping</span><strong>{grouping}</strong></div>
  </div>
}

function AdvancedFilters({ filters, options, loading, ticketSearch, setTicketSearch, ticketResults, searching, selectedTicket, onTicket, onChange, onClear }) {
  return <details className="timeline-advanced-filters">
    <summary><Icon name="filter" size={16}/>Advanced filters</summary>
    {loading && <p className="timeline-filter-loading" role="status">Loading available filters…</p>}
    <div className="timeline-filter-grid">
      <div className="field timeline-ticket-filter"><span>Ticket</span>{selectedTicket ? <div className="timeline-selected-filter"><span><strong>{selectedTicket.title}</strong><small>{selectedTicket.companyName} · Ticket {selectedTicket.number}</small></span><button type="button" className="icon-button" aria-label="Clear Ticket filter" onClick={() => onTicket(null)}><Icon name="close" size={15}/></button></div> : <><input value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} placeholder="Search Ticket, company, or number"/><div className="timeline-ticket-options">{searching ? <span>Searching…</span> : ticketResults.map((ticket) => <button type="button" key={ticket.id} onClick={() => onTicket(ticket)}><strong>{ticket.title}</strong><small>{ticket.companyName} · {ticket.number}</small></button>)}</div></>}</div>
      <label className="field"><span>Department</span><select value={filters.department} onChange={(event) => onChange('department', event.target.value)}><option value="">All departments</option>{options.departments.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      <label className="field"><span>Responsible manager</span><select value={filters.managerId} onChange={(event) => onChange('managerId', event.target.value)}><option value="">All managers</option>{options.managers.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      <label className="field"><span>Ticket status</span><select value={filters.status} onChange={(event) => onChange('status', event.target.value)}><option value="">All statuses</option>{options.statuses.map((item) => <option value={item} key={item}>{humanizeTimelineType(item)}</option>)}</select></label>
      <label className="field"><span>Ticket stage</span><select value={filters.stage} onChange={(event) => onChange('stage', event.target.value)}><option value="">All stages</option>{options.stages.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      <label className="field"><span>Activity type</span><select value={filters.activityType} onChange={(event) => onChange('activityType', event.target.value)}><option value="">All activity types</option>{options.activityTypes.map((item) => <option value={item} key={item}>{humanizeTimelineType(item)}</option>)}</select></label>
    </div>
    <button type="button" className="button button-secondary button-small" onClick={onClear}>Clear advanced filters</button>
  </details>
}

function SummaryCards({ totals, categories }) {
  return <div className="timeline-summary" aria-label="Timeline totals">{TIMELINE_CATEGORIES.map((category) => <article key={category.value} className={`${category.value} ${categories.includes(category.value) ? '' : 'muted'}`}><span>{category.label}</span><strong>{categories.includes(category.value) ? totals?.[category.value] ?? 0 : '—'}</strong><small>selected range</small></article>)}</div>
}

function DetailItem({ item, global }) {
  return <article className={`timeline-detail-item ${item.category}`}>
    <span className="timeline-detail-icon">{TIMELINE_CATEGORIES.find((category) => category.value === item.category)?.symbol}</span>
    <div className="timeline-detail-main">
      <header><div><span className="section-kicker">{humanizeTimelineType(item.eventType)}</span><h3>{item.category === 'activity' ? humanizeTimelineType(item.title) : item.title}</h3></div><time>{formatDateTime(item.occurredAt)}</time></header>
      {global && <p className="timeline-ticket-reference"><strong>{item.companyName}</strong> · Ticket {item.ticketNumber} · {item.ticketTitle}</p>}
      {item.description && <p>{item.description}</p>}
      <dl>
        <div><dt>Actor</dt><dd>{item.actorName}</dd></div><div><dt>Department</dt><dd>{humanizeTimelineType(item.department)}</dd></div>
        {item.previousValue && <div><dt>Previous</dt><dd>{humanizeTimelineType(item.previousValue)}</dd></div>}{item.newValue && <div><dt>New</dt><dd>{humanizeTimelineType(item.newValue)}</dd></div>}
        {item.direction && <div><dt>Direction</dt><dd>{humanizeTimelineType(item.direction)}</dd></div>}{item.status && <div><dt>Status</dt><dd>{humanizeTimelineType(item.status)}</dd></div>}
        {item.sender && <div><dt>Sender</dt><dd>{item.sender}</dd></div>}{item.recipients?.length > 0 && <div><dt>Recipient</dt><dd>{item.recipients.join(', ')}</dd></div>}
        {item.contactName && <div><dt>Contact</dt><dd>{item.contactName}</dd></div>}{Number.isFinite(item.durationSeconds) && <div><dt>Duration</dt><dd>{formatDuration(item.durationSeconds)}</dd></div>}
      </dl>
      {item.notes && <p className="timeline-detail-notes">{item.notes}</p>}
      {item.hasAttachments && <span className="timeline-attachment"><Icon name="file" size={14}/>Attachments</span>}
      {item.recordingAvailable && <span className="timeline-recording-status">Recording metadata available</span>}
      {global && <button type="button" className="button button-secondary button-small" onClick={() => navigate(`/console/tickets/${item.ticketId}`)}>Open Ticket</button>}
    </div>
  </article>
}

function DetailsPanel({ selection, details, loading, error, global, grouping, onPage }) {
  if (!selection) return <section className="timeline-details empty"><Icon name="timeline" size={26}/><h2>Select a chart bar</h2><p>The individual records represented by that bar will appear here.</p></section>
  return <section className="timeline-details" aria-labelledby="timeline-details-title">
    <header><div><span className="section-kicker">Selected records</span><h2 id="timeline-details-title">{TIMELINE_CATEGORIES.find((item) => item.value === selection.category)?.label} · {timelineBucketLabel(selection.date, grouping)}</h2></div><span>{details?.total ?? selection.count} record(s)</span></header>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {loading ? <div className="loading-state">Loading selected records…</div> : details?.records?.length ? <div className="timeline-detail-list">{details.records.map((item) => <DetailItem key={item.id} item={item} global={global}/>)}</div> : <div className="compact-empty">No records are available for this selected bar.</div>}
    {details && details.total > details.pageSize && <footer className="timeline-pagination"><button className="button button-secondary button-small" disabled={details.page <= 1 || loading} onClick={() => onPage(details.page - 1)}>Previous</button><span>Page {details.page} of {Math.ceil(details.total / details.pageSize)}</span><button className="button button-secondary button-small" disabled={details.page * details.pageSize >= details.total || loading} onClick={() => onPage(details.page + 1)}>Next</button></footer>}
  </section>
}

export function TimelineWorkspace({ ticket = null, global = false }) {
  const initialRange = useMemo(() => timelinePresetRange(30), [])
  const [preset, setPreset] = useState('30')
  const [dateRange, setDateRange] = useState(initialRange)
  const [categories, setCategories] = useState(TIMELINE_CATEGORIES.map((item) => item.value))
  const [advanced, setAdvanced] = useState({ ticketId: '', department: '', managerId: '', status: '', stage: '', activityType: '' })
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [options, setOptions] = useState(emptyOptions)
  const [filterLoading, setFilterLoading] = useState(global)
  const [ticketSearch, setTicketSearch] = useState('')
  const [ticketResults, setTicketResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState(null)
  const [details, setDetails] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const requestSequence = useRef(0)
  const detailSequence = useRef(0)
  const grouping = timelineGrouping(dateRange.from, dateRange.to)
  const filters = useMemo(() => ({ ...dateRange, grouping, categories, ...advanced, ticketId: ticket?.id ?? advanced.ticketId }), [advanced, categories, dateRange, grouping, ticket?.id])
  const validRange = timelineRangeIsValid(dateRange.from, dateRange.to)

  const load = useCallback(async () => {
    if (!validRange) { setLoading(false); return setError('Select a valid date range of no more than two years.') }
    const sequence = ++requestSequence.current
    setLoading(true); setError('')
    try { const result = await timelineService.summary(filters); if (sequence === requestSequence.current) setData(result) }
    catch (loadError) { if (sequence === requestSequence.current) setError(loadError.message) }
    finally { if (sequence === requestSequence.current) setLoading(false) }
  }, [filters, validRange])

  useEffect(() => { setSelection(null); setDetails(null); load() }, [load])
  useEffect(() => {
    if (!global) return undefined
    let active = true
    setFilterLoading(true)
    timelineService.filterOptions().then((result) => { if (active) setOptions(result) }).catch((loadError) => { if (active) setError(loadError.message) }).finally(() => { if (active) setFilterLoading(false) })
    return () => { active = false }
  }, [global])
  useEffect(() => {
    if (!global || selectedTicket) return undefined
    let active = true
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try { const result = await timelineService.searchTickets(ticketSearch); if (active) setTicketResults(result) }
      catch { if (active) setTicketResults([]) }
      finally { if (active) setSearching(false) }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [global, selectedTicket, ticketSearch])
  useEffect(() => {
    const refresh = () => load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener('leadsphere:timeline-changed', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('leadsphere:timeline-changed', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [load])

  const loadDetails = useCallback(async (selected, page = 1) => {
    const sequence = ++detailSequence.current
    setDetailLoading(true); setDetailError('')
    try { const result = await timelineService.details(filters, selected, page); if (sequence === detailSequence.current) setDetails(result) }
    catch (loadError) { if (sequence === detailSequence.current) setDetailError(loadError.message) }
    finally { if (sequence === detailSequence.current) setDetailLoading(false) }
  }, [filters])
  const selectBar = (selected) => { setSelection(selected); loadDetails(selected) }
  const changePreset = (value) => {
    setPreset(value)
    const presetOption = TIMELINE_PRESETS.find((item) => item.value === value)
    if (presetOption?.days) setDateRange(timelinePresetRange(presetOption.days))
  }
  const changeCategory = (category) => setCategories((current) => toggleTimelineCategory(current, category))
  const setFilter = (name, value) => setAdvanced((current) => ({ ...current, [name]: value }))
  const clearAdvanced = () => { setAdvanced({ ticketId: '', department: '', managerId: '', status: '', stage: '', activityType: '' }); setSelectedTicket(null); setTicketSearch('') }

  const controls = <div className="timeline-controls"><CategoryFilters selected={categories} onChange={changeCategory}/><DateRangeFilter preset={preset} from={dateRange.from} to={dateRange.to} grouping={grouping} onPreset={changePreset} onDate={(name, value) => setDateRange((current) => ({ ...current, [name]: value }))}/>{global && <AdvancedFilters filters={advanced} options={options} loading={filterLoading} ticketSearch={ticketSearch} setTicketSearch={setTicketSearch} ticketResults={ticketResults} searching={searching} selectedTicket={selectedTicket} onTicket={(selected) => { setSelectedTicket(selected); setFilter('ticketId', selected?.id ?? '') }} onChange={setFilter} onClear={clearAdvanced}/>}</div>
  const content = <>
    {controls}
    {error && <div className="alert alert-error timeline-alert" role="alert">{error}<button className="text-button" type="button" onClick={load}>Retry</button></div>}
    <SummaryCards totals={data?.totals} categories={categories}/>
    {loading ? <div className="loading-state timeline-loading">Loading Timeline chart…</div> : data?.series?.some((bucket) => categories.some((category) => Number(bucket[category]) > 0)) ? <TimelineChart series={data.series} categories={categories} grouping={grouping} selection={selection} onSelect={selectBar}/> : <div className="empty-state module-empty timeline-empty"><Icon name="timeline" size={30}/><h2>No Timeline records match this view.</h2><p>Try another date range or clear the advanced filters.</p></div>}
    {!loading && <DetailsPanel selection={selection} details={details} loading={detailLoading} error={detailError} global={global} grouping={grouping} onPage={(page) => loadDetails(selection, page)}/>} 
  </>

  if (!global) return <section className="detail-panel timeline-ticket-panel" aria-labelledby="ticket-timeline-heading"><div className="panel-heading"><div><h2 id="ticket-timeline-heading">Timeline</h2><p>Activity and customer communication history for this Ticket</p></div><button className="button button-secondary button-small" type="button" onClick={load} disabled={loading}>Refresh</button></div>{content}</section>
  return <div className="console-content timeline-page"><div className="page-heading"><div><span className="section-kicker">Authorized customer history</span><h1>Timeline</h1><p>Explore genuine Ticket activity, email launches, and call launches across the records available to you.</p></div><button className="button button-secondary" type="button" onClick={load} disabled={loading}>Refresh</button></div>{content}</div>
}
