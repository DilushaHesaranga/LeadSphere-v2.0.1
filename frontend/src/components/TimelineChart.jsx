import { useMemo, useState } from 'react'
import { TIMELINE_CATEGORIES, timelineBucketLabel } from '../config/timeline.js'

export function TimelineChart({ series, categories, grouping, selection, onSelect }) {
  const [hovered, setHovered] = useState(null)
  const visibleCategories = TIMELINE_CATEGORIES.filter((item) => categories.includes(item.value))
  const orderedSeries = useMemo(() => [...series].sort((left, right) => right.date.localeCompare(left.date)), [series])
  const scale = useMemo(() => {
    const maximum = Math.max(1, ...orderedSeries.flatMap((bucket) => visibleCategories.map((category) => Number(bucket[category.value] ?? 0))))
    const step = Math.max(1, Math.ceil(maximum / 4))
    return { maximum: step * 4, ticks: [step * 4, step * 3, step * 2, step, 0] }
  }, [orderedSeries, visibleCategories])
  const tooltip = hovered ?? selection

  return <section className="timeline-chart-card" aria-labelledby="timeline-chart-title">
    <header className="timeline-chart-heading">
      <div><span className="section-kicker">Occurrence volume</span><h2 id="timeline-chart-title">Ticket Timeline</h2></div>
      <span className="timeline-grouping">Grouped by {grouping}</span>
    </header>
    <div className="timeline-legend" aria-label="Timeline chart legend">{visibleCategories.map((category) => <span key={category.value} className={`timeline-legend-item ${category.value}`}><i>{category.symbol}</i>{category.label}</span>)}</div>
    <div id="timeline-chart-description" className="sr-only">Grouped bar chart. The horizontal axis shows dates and the vertical axis shows occurrence counts. Focus a bar to hear its date, category, and count.</div>
    <div className="timeline-chart-tooltip" role="status" aria-live="polite">{tooltip ? <><strong>{timelineBucketLabel(tooltip.date, grouping)}</strong><span>{TIMELINE_CATEGORIES.find((item) => item.value === tooltip.category)?.label}: {tooltip.count}</span></> : <span>Hover or focus a bar to inspect its count.</span>}</div>
    <div className="timeline-chart-scroll" tabIndex="0" aria-label="Scrollable Timeline chart">
      <div className="timeline-chart" style={{ '--timeline-points': Math.max(orderedSeries.length, 1) }} aria-describedby="timeline-chart-description">
        <div className="timeline-y-axis" aria-hidden="true">{scale.ticks.map((tick) => <span key={tick}>{tick}</span>)}</div>
        <div className="timeline-plot">
          <div className="timeline-grid-lines" aria-hidden="true">{scale.ticks.map((tick) => <i key={tick}/>)}</div>
          <div className="timeline-bar-groups">
            {orderedSeries.map((bucket) => <div className="timeline-bar-group" key={bucket.date}>
              <div className="timeline-bars">{visibleCategories.map((category) => {
                const count = Number(bucket[category.value] ?? 0)
                const selected = selection?.date === bucket.date && selection?.category === category.value
                const datum = { date: bucket.date, category: category.value, count }
                return <button
                  key={category.value}
                  type="button"
                  className={`timeline-bar ${category.value} ${selected ? 'selected' : ''} ${count === 0 ? 'zero' : ''}`}
                  style={{ height: `${Math.max(count ? 4 : 1, (count / scale.maximum) * 100)}%` }}
                  disabled={!count}
                  aria-label={`${timelineBucketLabel(bucket.date, grouping)}, ${category.label}, ${count} occurrences`}
                  aria-pressed={selected}
                  onMouseEnter={() => setHovered(datum)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(datum)}
                  onBlur={() => setHovered(null)}
                  onClick={() => onSelect(datum)}
                />
              })}</div>
              <time>{timelineBucketLabel(bucket.date, grouping)}</time>
            </div>)}
          </div>
        </div>
      </div>
    </div>
  </section>
}
