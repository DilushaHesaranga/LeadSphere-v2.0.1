import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/Icons.jsx'
import { dashboardMoney } from '../config/dashboard.js'
import { expectedRevenue, scoreTickets } from '../config/winScoring.js'
import { dashboardService } from '../services/dashboardService.js'
import { navigate } from '../utils/router.js'
import './DashboardPage.css'

export function PersonalDashboardPage({ profile }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [contacts, setContacts] = useState({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const sequence = useRef(0)
  const queue = useRef(null)
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true); setData(null); setError(''); setContacts({})
    try { const next = await dashboardService.getPersonal(); if (request === sequence.current) { setData(next); setPage(1) } }
    catch (failure) { if (request === sequence.current) setError(failure.message) }
    finally { if (request === sequence.current) setLoading(false) }
  }, [])
  useEffect(() => {
    refresh()
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', visible)
    // This ref is a request counter, not a DOM ref; invalidate the latest request on unmount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    return () => { sequence.current++; document.removeEventListener('visibilitychange', visible) }
  }, [refresh])
  const result = useMemo(() => scoreTickets(data?.tickets, data?.history), [data])
  const revenue = useMemo(() => expectedRevenue(result.tickets), [result])
  const filtered = result.tickets.filter((ticket) => `${ticket.projectTitle} ${ticket.companyName}`.toLowerCase().includes(search.toLowerCase()))
  const pages = Math.max(1, Math.ceil(filtered.length / 10))
  const call = async (ticket, contactId) => {
    if (busy) return
    setBusy(ticket.id); setError('')
    try {
      const response = await dashboardService.prepareCall(ticket.id, contactId)
      if (!/^\+?[0-9() -]{7,30}$/.test(response.phone)) throw new Error('No valid phone number is available.')
      window.dispatchEvent(new Event('leadsphere:timeline-changed'))
      window.location.href = `tel:${response.phone.replace(/[() -]/g, '')}`
    } catch (failure) { setError(failure.message) }
    finally { setBusy('') }
  }
  return <main className="console-content crm-dashboard personal-dashboard">
    <header className="crm-dashboard-heading"><div><span className="section-kicker">Your personal workspace</span><h1>My CRM dashboard</h1><p>{profile?.display_name?.split(' ')[0] || 'Here'}, see your assigned tickets, cases you own, and tickets you manage.</p></div><button type="button" className="button button-secondary" onClick={refresh} disabled={loading || Boolean(busy)}>Refresh dashboard</button></header>
    {error && <div className="alert alert-error" role="alert">{error}<button type="button" className="text-button" onClick={refresh}>Retry</button></div>}
    {loading && <p role="status">Loading your personal dashboard…</p>}
    {data && <>
      <div className="crm-dashboard-context"><span>Only your current ownership and assignments · Updated {new Date(data.asOf).toLocaleString()}</span></div>
      <section className="crm-dashboard-metrics" aria-label="My ticket totals">{[['totalTickets','My tickets'],['activeTickets','Active opportunities'],['wonTickets','Won tickets'],['lostTickets','Lost tickets'],['closedTickets','Closed tickets']].map(([key,label]) => <article className="crm-dashboard-metric" key={key}><span>{label}</span><strong>{data.metrics[key]}</strong><small>Current tickets in your personal scope</small></article>)}</section>
      <section className="crm-dashboard-panel personal-revenue"><header className="crm-dashboard-panel-heading"><div><span className="section-kicker">Active opportunities</span><h2>Expected revenue</h2></div><button type="button" className="button button-primary" onClick={() => { queue.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); queue.current?.focus({ preventScroll: true }) }}><Icon name="phone" size={16}/>Prioritize calls</button></header>
        <p className="crm-dashboard-note">Estimated value = recorded deal value × win probability. These are uncertain estimates, not committed sales or payments. Currencies are never combined.</p>
        <div className="personal-revenue-grid">{revenue.totals.map((total) => <article key={total.currency}><h3>{total.currency}</h3><strong>{dashboardMoney(total.expected,total.currency)}</strong><p>Expected from {dashboardMoney(total.value,total.currency)} active deal value</p><progress aria-label={`Expected proportion of ${total.currency} pipeline`} value={total.value ? total.expected / total.value : 0} max="1"/><small>{total.count} tickets with recorded values</small></article>)}</div>
        {!revenue.totals.length && <p className="crm-dashboard-note">{result.tickets.length ? 'Add deal values in Ticket details → Overview to calculate expected revenue.' : 'No active opportunities in your personal scope.'}</p>}
        {revenue.missing > 0 && <p className="crm-dashboard-note">{revenue.missing} active tickets have no recorded value and are excluded from monetary totals.</p>}
      </section>
      <section className="crm-dashboard-panel personal-call-list"><header className="crm-dashboard-panel-heading"><div><span className="section-kicker">Next best calls</span><h2 tabIndex={-1} ref={queue}>Call priority</h2></div><label className="field"><span>Search my tickets</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }}/></label></header>
        <p className="crm-dashboard-note">Highest estimated win probability first; overdue follow-ups break ties. Calling opens your device’s dialer and records a call launch, not a completed conversation.</p>
        <details className="personal-model"><summary>{result.model.name} · {result.model.samples} historical outcomes</summary><p>{result.model.trained ? 'The model learns from deal-size bands (separate by currency), completed follow-ups, and ticket age in your available won/lost history. It has not been calibrated or validated for forecasting accuracy.' : 'There is not enough outcome history to train the model: at least 20 outcomes, including 5 wins and 5 losses, are required. Until then, estimates use pipeline-stage probability, completed follow-ups, and ticket age.'}</p><p>Historical interactions stop at the outcome date. Values changed after that date are treated as unknown. Estimates are capped at 5–95%; use your judgment alongside the score.</p></details>
        <div className="crm-dashboard-table-wrap"><table className="crm-dashboard-table"><thead><tr><th>Priority / ticket</th><th>Win probability</th><th>Deal / expected value</th><th>Signals</th><th>Call</th></tr></thead><tbody>{filtered.slice((page-1)*10,page*10).map((ticket,index) => {
          const contactId = contacts[ticket.id] || (ticket.contacts.length === 1 ? ticket.contacts[0].id : '')
          return <tr key={ticket.id}><td><strong>#{(page-1)*10+index+1} </strong><button type="button" className="inline-link" onClick={() => navigate(`/console/tickets/${ticket.id}`)}>{ticket.projectTitle}</button><small>{ticket.companyName} · {ticket.stageName}</small></td><td><strong>{ticket.winProbability}%</strong><progress aria-label={`Win probability for ${ticket.projectTitle}`} value={ticket.winProbability} max="100"/><small>{result.model.trained ? 'Experimental ML estimate' : 'Provisional estimate'}</small></td><td>{dashboardMoney(ticket.dealValue,ticket.currency || 'LKR')}<small>Expected: {dashboardMoney(ticket.expectedValue,ticket.currency || 'LKR')}</small></td><td>{Math.floor(ticket.ageDays)} days old<small>{ticket.interactions} completed follow-ups</small><small>{ticket.overdueFollowUps} overdue</small></td><td>{ticket.contacts.length > 1 && <select aria-label={`Contact for ${ticket.projectTitle}`} value={contactId} onChange={(event) => setContacts((current) => ({ ...current,[ticket.id]:event.target.value }))}><option value="">Choose contact</option>{ticket.contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.name} · {contact.value}</option>)}</select>}<button type="button" className="button button-secondary button-small" disabled={!contactId || Boolean(busy)} onClick={() => call(ticket,contactId)}>{busy === ticket.id ? 'Opening…' : 'Call'}</button>{!ticket.contacts.length && <small>No phone number recorded</small>}</td></tr>
        })}</tbody></table></div>
        {!filtered.length && <p className="crm-dashboard-note">{search ? 'No tickets match your search.' : 'No active tickets to prioritize.'}</p>}
        <footer className="crm-dashboard-pagination"><span>{filtered.length} active tickets · Page {page} of {pages}</span><div><button type="button" disabled={page<=1} onClick={() => setPage(page-1)}>Previous</button><button type="button" disabled={page>=pages} onClick={() => setPage(page+1)}>Next</button></div></footer>
      </section>
    </>}
  </main>
}
