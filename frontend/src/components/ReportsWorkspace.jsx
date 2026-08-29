import { useMemo } from 'react'
import { Icon } from './Icons.jsx'
import {
  comparisonFor, formatReportMetric, reportBucketLabel, reportDateLabel,
  reportPresetRange, summarizePipelineHealth, REPORT_PRESETS,
} from '../config/reports.js'

const METRIC_CARDS = Object.freeze([
  { key: 'newTickets', label: 'New Tickets', format: 'count', report: 'ticket-volume', hint: 'Created in the selected period' },
  { key: 'convertedTickets', label: 'Converted Tickets', format: 'count', report: 'conversion', hint: 'Selected-period cohort reaching Customer stages' },
  { key: 'conversionRate', label: 'Conversion Rate', format: 'percent', report: 'conversion', hint: 'Converted cohort ÷ new Tickets' },
  { key: 'activePipeline', label: 'Active Pipeline', format: 'count', report: 'pipeline-health', hint: 'Active Tickets in open stages' },
  { key: 'wonTickets', label: 'Won Tickets', format: 'count', report: 'outcomes', hint: 'Won during the selected period' },
  { key: 'winRate', label: 'Win Rate', format: 'percent', report: 'outcomes', hint: 'Won ÷ concluded Tickets' },
  { key: 'averageSalesCycleDays', label: 'Average Sales Cycle', format: 'days', report: 'outcomes', hint: 'Creation to current Won/Lost outcome' },
  { key: 'activitiesRecorded', label: 'Activities Recorded', format: 'count', report: 'activity-summary', hint: 'Server-recorded workflow events' },
  { key: 'completedFollowUps', label: 'Completed Follow Ups', format: 'count', report: 'follow-up-health', hint: 'Completed during the period' },
  { key: 'overdueFollowUps', label: 'Overdue Follow Ups', format: 'count', report: 'follow-up-health', hint: 'Pending and past their scheduled time', inverse: true },
])

function Comparison({ metric, inverse }) {
  const comparison = comparisonFor(metric, { inverse })
  if (!comparison) return <span className="report-comparison neutral">No comparable value</span>
  const symbol = comparison.direction === 'positive' ? '↑' : comparison.direction === 'negative' ? '↓' : '→'
  const amount = comparison.percent == null ? 'New' : `${Math.abs(comparison.percent)}%`
  return <span className={`report-comparison ${comparison.direction}`}><b aria-hidden="true">{symbol}</b>{amount} vs previous period</span>
}

export function ReportMetricGrid({ metrics = {}, onOpenReport }) {
  return <section className="report-metric-grid" aria-label="Report summary metrics">
    {METRIC_CARDS.map((definition, index) => {
      const metric = metrics[definition.key] ?? {}
      return <button key={definition.key} type="button" className={`report-metric-card ${index === 0 ? 'featured' : ''}`} onClick={() => onOpenReport(definition.report)} aria-label={`${definition.label}: ${formatReportMetric(metric.value, definition.format)}. Open supporting report.`}>
        <span>{definition.label}</span>
        <strong>{formatReportMetric(metric.value, definition.format)}</strong>
        <Comparison metric={metric} inverse={definition.inverse}/>
        <small>{definition.hint}</small>
      </button>
    })}
  </section>
}

export function ReportFilterBar({ filters, options = {}, onChange, onClear }) {
  const today = options.today
  const stages = (options.stages ?? []).filter((stage) => !filters.pipelineId || stage.pipelineId === filters.pipelineId)
  const active = Boolean(filters.pipelineId || filters.stage || filters.ownerId || filters.preset !== '30')
  const setPreset = (preset) => {
    if (preset === 'custom') return onChange({ ...filters, preset })
    onChange({ ...filters, preset, ...reportPresetRange(preset, today) })
  }
  const setFilter = (key, value) => onChange({
    ...filters,
    [key]: value,
    ...(key === 'pipelineId' ? { stage: '' } : {}),
    ...(['from', 'to'].includes(key) ? { preset: 'custom' } : {}),
  })
  return <section className="report-filter-panel" aria-label="Reports filters">
    <div className="report-filter-grid">
      <label className="field"><span>Date range</span><select value={filters.preset} onChange={(event) => setPreset(event.target.value)}>{REPORT_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></label>
      <label className="field"><span>From</span><input type="date" value={filters.from} max={filters.to} onChange={(event) => setFilter('from', event.target.value)}/></label>
      <label className="field"><span>To</span><input type="date" value={filters.to} min={filters.from} max={today} onChange={(event) => setFilter('to', event.target.value)}/></label>
      <label className="field"><span>Pipeline</span><select value={filters.pipelineId} onChange={(event) => setFilter('pipelineId', event.target.value)}><option value="">All pipelines</option>{(options.pipelines ?? []).map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select></label>
      <label className="field"><span>Stage</span><select value={filters.stage} onChange={(event) => setFilter('stage', event.target.value)}><option value="">All stages</option>{stages.map((stage) => <option key={stage.slug} value={stage.slug}>{stage.name}</option>)}</select></label>
      <label className="field"><span>Owner or assignee</span><select value={filters.ownerId} onChange={(event) => setFilter('ownerId', event.target.value)}><option value="">Everyone in scope</option>{(options.owners ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
    </div>
    <div className="report-filter-summary"><span><Icon name="calendar" size={15}/>{reportDateLabel(filters.from, filters.to)}</span><span>Timezone: {options.timezone ?? 'Asia/Colombo'}</span>{active && <button type="button" className="text-button" onClick={onClear}>Clear filters</button>}</div>
  </section>
}

function ChartHeader({ kicker, title, detail }) {
  return <header className="report-chart-heading"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div>{detail && <span>{detail}</span>}</header>
}

export function TicketVolumeChart({ series = [], onDrillDown }) {
  const maximum = Math.max(1, ...series.map((item) => Number(item.tickets ?? 0)))
  return <section className="report-chart-card report-volume-card">
    <ChartHeader kicker="Creation trend" title="Ticket volume over time" detail={`${series.reduce((sum, item) => sum + Number(item.tickets ?? 0), 0)} created`}/>
    <p className="sr-only">Bar chart of Tickets created in each reporting period. Activate a bar to open its underlying records.</p>
    <div className="report-volume-chart" role="list" aria-label="Ticket creation chart">
      {series.map((bucket) => <button key={bucket.from} type="button" role="listitem" onClick={() => onDrillDown('ticket-volume', { from: bucket.from, to: bucket.to, preset: 'custom' })} aria-label={`${reportBucketLabel(bucket)}: ${bucket.tickets} Tickets. Open records.`}>
        <span className="report-bar-value">{bucket.tickets}</span><i style={{ height: `${Math.max(bucket.tickets ? 7 : 2, (Number(bucket.tickets) / maximum) * 100)}%` }}/><time>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${bucket.from}T00:00:00Z`))}</time>
      </button>)}
    </div>
  </section>
}

export function PipelineFunnel({ stages = [], summary, asOf, onDrillDown }) {
  const health = useMemo(() => ({ ...summarizePipelineHealth(stages, asOf), ...summary }), [asOf, stages, summary])
  const normalizedStages = summarizePipelineHealth(health.stages ?? stages, health.asOf ?? asOf).stages
  const maximum = Math.max(1, ...normalizedStages.map((stage) => stage.count))
  return <section className="report-chart-card report-funnel-card" aria-labelledby="pipeline-health-title">
    <header className="report-chart-heading pipeline-health-heading"><div><span className="section-kicker">Pipeline health</span><h2 id="pipeline-health-title">Active workload by open stage</h2></div><span>As of {health.asOf ? reportDateLabel(health.asOf, health.asOf) : 'period end'}</span></header>
    <div className="pipeline-health-summary" aria-label="Pipeline health summary">
      <span><small>Active Tickets</small><strong>{health.total ?? 0}</strong></span>
      <span><small>Occupied stages</small><strong>{health.occupiedStages ?? 0}</strong></span>
      <span className={(health.attentionStages ?? 0) > 0 ? 'attention' : ''}><small>Attention stages</small><strong>{health.attentionStages ?? 0}</strong></span>
    </div>
    <div className="pipeline-health-guide"><span>Workload share and average time in stage</span><span><i className="watch"/>Watch at 7 days <i className="attention"/>Needs attention at 14 days</span></div>
    <div className="pipeline-health-list" role="list" aria-label="Active Ticket workload by open pipeline stage">
      {normalizedStages.map((stage) => <button key={`${stage.pipelineId}-${stage.stage}`} type="button" role="listitem" className={`pipeline-health-row ${stage.health.key}`} disabled={!stage.count} onClick={() => onDrillDown('pipeline-health', { stage: stage.stage })} aria-label={`${stage.label}: ${stage.count} active Tickets, ${stage.workloadShare}% of workload, average ${stage.averageAgeDays} days in stage, ${stage.health.label}. ${stage.count ? 'Open records.' : ''}`}>
        <span className="pipeline-stage-name"><strong>{stage.label}</strong><small>{stage.pipelineName}</small></span>
        <span className="pipeline-stage-meter" aria-hidden="true"><i style={{ width: `${(stage.count / maximum) * 100}%` }}/></span>
        <span className="pipeline-stage-stat"><strong>{stage.count}</strong><small>{stage.workloadShare}% of workload</small></span>
        <span className="pipeline-stage-stat"><strong>{stage.averageAgeDays}</strong><small>avg days</small></span>
        <span className={`pipeline-health-pill ${stage.health.key}`}>{stage.health.label}</span>
      </button>)}
      {!normalizedStages.length && <div className="report-chart-empty"><Icon name="chart" size={25}/><strong>No active pipeline workload</strong><span>No open stages match the selected filters.</span></div>}
    </div>
  </section>
}

export function OutcomeChart({ series = [], onDrillDown }) {
  const maximum = Math.max(1, ...series.flatMap((bucket) => [Number(bucket.won ?? 0), Number(bucket.lost ?? 0)]))
  return <section className="report-chart-card report-outcome-card">
    <ChartHeader kicker="Concluded work" title="Won versus lost" detail="Selected period"/>
    <div className="report-chart-legend"><span className="won"><i/>Won</span><span className="lost"><i/>Lost</span></div>
    <div className="report-outcome-chart" aria-label="Won and lost Ticket chart">
      {series.map((bucket) => <button key={bucket.from} type="button" onClick={() => onDrillDown('outcomes', { from: bucket.from, to: bucket.to, preset: 'custom' })} aria-label={`${reportBucketLabel(bucket)}: ${bucket.won} won and ${bucket.lost} lost. Open records.`}>
        <span className="outcome-bars"><i className="won" style={{ height: `${Math.max(bucket.won ? 6 : 1, (Number(bucket.won) / maximum) * 100)}%` }}/><i className="lost" style={{ height: `${Math.max(bucket.lost ? 6 : 1, (Number(bucket.lost) / maximum) * 100)}%` }}/></span>
        <time>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${bucket.from}T00:00:00Z`))}</time>
      </button>)}
    </div>
  </section>
}

export function FollowUpHealthChart({ series = [], onDrillDown }) {
  const counts = Object.fromEntries(series.map((item) => [item.status, Number(item.count ?? 0)]))
  const total = (counts.PENDING ?? 0) + (counts.COMPLETED ?? 0) + (counts.CANCELLED ?? 0)
  const completedPercent = total ? ((counts.COMPLETED ?? 0) / total) * 100 : 0
  const pendingPercent = total ? ((counts.PENDING ?? 0) / total) * 100 : 0
  const gradient = `conic-gradient(var(--accent) 0 ${completedPercent}%, #6b88df ${completedPercent}% ${completedPercent + pendingPercent}%, #c6cec9 ${completedPercent + pendingPercent}% 100%)`
  return <section className="report-chart-card report-followup-card">
    <ChartHeader kicker="Operational risk" title="Follow Up health" detail={`${total} scheduled`}/>
    <button type="button" className="report-donut-layout" onClick={() => onDrillDown('follow-up-health')} aria-label={`${total} Follow Ups. ${counts.COMPLETED ?? 0} completed, ${counts.PENDING ?? 0} pending, ${counts.CANCELLED ?? 0} cancelled, ${counts.OVERDUE ?? 0} overdue. Open records.`}>
      <span className="report-donut" style={{ background: gradient }}><i><strong>{total}</strong><small>Total</small></i></span>
      <span className="report-donut-legend">{[
        ['COMPLETED', 'Completed'], ['PENDING', 'Pending'], ['CANCELLED', 'Cancelled'], ['OVERDUE', 'Overdue'],
      ].map(([key, label]) => <span key={key} className={key.toLowerCase()}><i/><b>{label}</b><strong>{counts[key] ?? 0}</strong></span>)}</span>
    </button>
  </section>
}

export function ReportComparisonChart({ title, kicker, current = 0, previous = 0, currentLabel = 'Current period', previousLabel = 'Previous period' }) {
  const maximum = Math.max(1, Number(current ?? 0), Number(previous ?? 0))
  const values = [
    { label: currentLabel, value: Number(current ?? 0), className: 'current' },
    { label: previousLabel, value: Number(previous ?? 0), className: 'previous' },
  ]
  return <section className="report-chart-card report-comparison-card">
    <ChartHeader kicker={kicker} title={title} detail="Equivalent periods"/>
    <div className="report-comparison-chart" role="img" aria-label={`${title}. ${currentLabel}: ${current ?? 0}. ${previousLabel}: ${previous ?? 0}.`}>
      {values.map((item) => <span key={item.label} className={item.className}><b>{formatReportMetric(item.value)}</b><i style={{ width: `${Math.max(item.value ? 5 : 1, (item.value / maximum) * 100)}%` }}/><small>{item.label}</small></span>)}
    </div>
  </section>
}

export function TeamPerformanceTable({ items = [], onDrillDown }) {
  return <section className="report-chart-card report-team-card">
    <ChartHeader kicker="Current assignees" title="Team performance" detail="Top 8 contributors"/>
    {items.length ? <div className="report-team-table" aria-label="Assigned team performance">
      <div className="report-team-row heading" aria-hidden="true"><span>Team member</span><span>New</span><span>Converted</span><span>Won</span><span>Win rate</span></div>
      {items.map((item, index) => <button type="button" className="report-team-row" key={item.userId} onClick={() => onDrillDown('team-performance', { ownerId: item.userId })} aria-label={`${item.name}: ${item.newTickets} new, ${item.converted} converted, ${item.won} won, ${formatReportMetric(item.winRate, 'percent')} win rate. Open records.`}>
        <span><i>{index + 1}</i><strong>{item.name}</strong></span><span>{item.newTickets}</span><span>{item.converted}</span><span>{item.won}</span><span>{formatReportMetric(item.winRate, 'percent')}</span>
      </button>)}
    </div> : <div className="report-chart-empty">No currently assigned users have reportable Tickets in this scope.</div>}
  </section>
}

export function ReportInsights({ insights = [], onDrillDown }) {
  return <section className="report-insights" aria-labelledby="report-insights-title">
    <header><div><span className="section-kicker">Explainable observations</span><h2 id="report-insights-title">Insights that need attention</h2></div><span>Rules based · Not AI-generated</span></header>
    <div className="report-insight-grid">{insights.map((insight, index) => <button key={`${insight.title}-${index}`} type="button" className={`report-insight ${insight.tone}`} onClick={() => onDrillDown(insight.reportKey, insight.stage ? { stage: insight.stage } : {})}>
      <span className="report-insight-icon"><Icon name={insight.tone === 'danger' ? 'bell' : insight.tone === 'positive' ? 'check' : 'activity'} size={18}/></span><span><strong>{insight.title}</strong><small>{insight.message}</small></span><Icon name="arrow" size={16}/>
    </button>)}</div>
  </section>
}

export function ReportSkeleton() {
  return <div className="report-skeleton" aria-live="polite" aria-label="Loading Reports & Insights"><div className="report-skeleton-grid">{Array.from({ length: 8 }, (_, index) => <span key={index}/>)}</div><div className="report-skeleton-charts"><span/><span/></div></div>
}

export function ReportMetricDefinitions({ definitions = [] }) {
  const definitionsByKey = useMemo(() => new Map(definitions.map((item) => [item.key, item])), [definitions])
  return <details className="report-definitions"><summary>How these metrics are calculated</summary><div>{METRIC_CARDS.map((metric) => definitionsByKey.has(metric.key) && <article key={metric.key}><strong>{definitionsByKey.get(metric.key).label}</strong><p>{definitionsByKey.get(metric.key).description}</p></article>)}</div></details>
}
