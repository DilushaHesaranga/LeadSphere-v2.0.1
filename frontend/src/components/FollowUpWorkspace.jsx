import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import { followUpFrequencyLabel, FOLLOW_UP_STATUSES } from '../config/followUps.js'
import { formatDateTime } from '../config/crm.js'
import { followUpService } from '../services/followUpService.js'
import { navigate } from '../utils/router.js'
import { ConfirmDialog } from './ConfirmDialog.jsx'
import { FollowUpDialog } from './FollowUpDialog.jsx'
import { Icon } from './Icons.jsx'
import { StatusBadge } from './StatusBadge.jsx'

const views = ['ALL', ...FOLLOW_UP_STATUSES]

function typeIcon(type) {
  if (type === 'EMAIL') return 'mail'
  if (type === 'CALL') return 'phone'
  return 'users'
}

function typeLabel(type) {
  return type ? type[0] + type.slice(1).toLowerCase() : 'Follow Up'
}

function groupFollowUps(items, ticket, global) {
  const sorted = [...items].sort((left, right) => new Date(left.scheduledAt) - new Date(right.scheduledAt))
  if (!global) return [{
    id: ticket?.id ?? 'ticket',
    title: ticket?.title,
    companyName: ticket?.companyName,
    ticketNumber: ticket?.number,
    items: sorted,
  }]

  const groups = new Map()
  sorted.forEach((item) => {
    if (!groups.has(item.ticketId)) groups.set(item.ticketId, {
      id: item.ticketId,
      title: item.ticketTitle,
      companyName: item.companyName,
      ticketNumber: item.ticketNumber,
      items: [],
    })
    groups.get(item.ticketId).items.push(item)
  })
  return [...groups.values()]
}

function FollowUpCard({ item, mayManage, busy, onEdit, onComplete, onCancel, onStop }) {
  const pending = item.status === 'PENDING'
  const overdue = pending && new Date(item.scheduledAt).getTime() < Date.now()
  return <article className={`follow-up-card ${overdue ? 'overdue' : ''}`}>
    <header className="follow-up-card-heading">
      <span className="follow-up-card-icon"><Icon name={typeIcon(item.type)} size={17}/></span>
      <strong>{typeLabel(item.type)}</strong>
      <span className="follow-up-card-badges"><StatusBadge value={item.status}/>{overdue && <span className="crm-badge follow-up-overdue"><i/>Overdue</span>}</span>
    </header>
    <div className="follow-up-card-body">
      <p className="follow-up-instruction">{pending ? 'Scheduled customer action' : item.status === 'COMPLETED' ? 'Customer action completed' : 'Customer action cancelled'}</p>
      {item.purpose && <div className="follow-up-purpose"><span>Purpose</span><p>{item.purpose}</p></div>}
      <dl className="follow-up-meta">
        <div><dt>{pending ? 'Due date' : 'Scheduled date'}</dt><dd>{formatDateTime(item.scheduledAt)}</dd></div>
        <div><dt>Schedule</dt><dd>{item.recurring ? followUpFrequencyLabel(item.frequency) : 'One-time'}{item.recurring && !item.seriesActive ? ' · Stopped' : ''}</dd></div>
        <div><dt>Created by</dt><dd>{item.createdByName}</dd></div>
      </dl>
    </div>
    {mayManage && pending && <footer className="follow-up-actions">
      <button className="text-button" type="button" onClick={() => onEdit(item)} disabled={busy}>Edit</button>
      {item.recurring && item.seriesActive && <button className="text-button" type="button" onClick={() => onStop(item)} disabled={busy}>Stop series</button>}
      <button className="text-button danger-text" type="button" onClick={() => onCancel(item)} disabled={busy}>Cancel</button>
      <button className="button button-primary button-small" type="button" onClick={() => onComplete(item)} disabled={busy}><Icon name="check" size={14}/>Complete</button>
    </footer>}
  </article>
}

function FollowUpBoard({ items, ticket, global, mayManage, busy, onEdit, onComplete, onCancel, onStop }) {
  const groups = groupFollowUps(items, ticket, global)
  return <div className="follow-up-cadences">
    {groups.map((group) => <section className="follow-up-cadence" key={group.id} aria-label={`Follow Ups for ${group.title ?? 'Ticket'}`}>
      <header className="follow-up-cadence-heading">
        <div><span className="section-kicker">{group.companyName}{group.ticketNumber ? ` · Ticket ${group.ticketNumber}` : ''}</span><h2>{group.title ?? 'Ticket Follow Ups'}</h2></div>
        {global && <button className="button button-secondary button-small" type="button" onClick={() => navigate(`/console/tickets/${group.id}`)}>View Ticket</button>}
      </header>
      <div className="follow-up-board-scroll" tabIndex="0" aria-label="Horizontally scrollable follow-up sequence">
        <div className="follow-up-board">
          {group.items.map((item, index) => <div className="follow-up-stage" key={item.id}>
            <div className="follow-up-stage-title"><span>Follow-up {index + 1}</span><small>{typeLabel(item.type)}</small></div>
            <FollowUpCard item={item} mayManage={mayManage} busy={busy} onEdit={onEdit} onComplete={onComplete} onCancel={onCancel} onStop={onStop}/>
          </div>)}
        </div>
      </div>
    </section>)}
  </div>
}

export function FollowUpWorkspace({ ticket = null, global = false }) {
  const { can } = useAuth()
  const [view, setView] = useState('ALL')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [dialog, setDialog] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const mayManage = can(PERMISSIONS.TICKET_NOTES_CREATE)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setItems(await followUpService.list({ ticketId: ticket?.id ?? null, status: view === 'ALL' ? null : view })) }
    catch (loadError) { setError(loadError.message) }
    finally { setLoading(false) }
  }, [ticket?.id, view])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const refresh = () => load()
    window.addEventListener('leadsphere:follow-ups-changed', refresh)
    return () => window.removeEventListener('leadsphere:follow-ups-changed', refresh)
  }, [load])

  const changed = (message) => {
    setSuccess(message); setError(''); setDialog(null); setConfirmation(null)
    window.dispatchEvent(new Event('leadsphere:follow-ups-changed'))
  }
  const run = async (operation, message) => {
    setBusy(true); setError(''); setSuccess('')
    try { const result = await operation(); changed(typeof message === 'function' ? message(result) : message) }
    catch (actionError) { setError(actionError.message) }
    finally { setBusy(false) }
  }
  const complete = (item) => run(() => followUpService.complete(item.id), (result) => result.nextFollowUpId ? 'Follow Up completed. The next recurring occurrence was scheduled.' : 'Follow Up completed.')
  const confirm = () => {
    const { type, item } = confirmation
    if (type === 'cancel') return run(() => followUpService.cancel(item.id), 'Follow Up cancelled.')
    return run(() => followUpService.stopSeries(item.seriesId), 'Recurring series stopped. Existing history was preserved.')
  }

  const body = <>
    <div className="follow-up-tabs" role="tablist" aria-label="Follow Up status">{views.map((status) => <button key={status} type="button" role="tab" aria-selected={view === status} className={view === status ? 'active' : ''} onClick={() => setView(status)}>{status === 'ALL' ? 'All' : status[0] + status.slice(1).toLowerCase()}</button>)}</div>
    {error && <div className="alert alert-error" role="alert">{error}<button className="text-button" type="button" onClick={load}>Retry</button></div>}
    {success && <div className="alert alert-success" role="status">{success}</div>}
    {loading ? <div className="loading-state panel-loading">Loading Follow Ups...</div> : items.length ? <FollowUpBoard items={items} ticket={ticket} global={global} mayManage={mayManage} busy={busy} onEdit={(item) => setDialog(item)} onComplete={complete} onCancel={(item) => setConfirmation({ type: 'cancel', item })} onStop={(item) => setConfirmation({ type: 'stop', item })}/> : <div className="empty-state module-empty"><Icon name="calendar" size={30}/><h2>No {view === 'ALL' ? '' : view.toLowerCase()} Follow Ups.</h2><p>{mayManage ? 'Create a Follow Up to keep the next customer action visible.' : 'Follow Ups will appear here when they are scheduled.'}</p>{mayManage && !global && <button className="button button-primary" type="button" onClick={() => setDialog('create')}><Icon name="plus" size={16}/>Create Follow Up</button>}</div>}
    {dialog && <FollowUpDialog ticket={ticket} followUp={dialog === 'create' ? null : dialog} onClose={() => setDialog(null)} onSaved={(_result, _selectedTicket, editing) => changed(editing ? 'Follow Up updated.' : 'Follow Up created.')}/>} 
    {confirmation && <ConfirmDialog title={confirmation.type === 'cancel' ? 'Cancel Follow Up' : 'Stop recurring series'} confirmLabel={confirmation.type === 'cancel' ? 'Cancel Follow Up' : 'Stop recurrence'} danger busy={busy} onClose={() => setConfirmation(null)} onConfirm={confirm}><p>{confirmation.type === 'cancel' ? <>Cancel the Follow Up scheduled for <strong>{formatDateTime(confirmation.item.scheduledAt)}</strong>?</> : <>Stop the <strong>{followUpFrequencyLabel(confirmation.item.frequency)}</strong> recurring series?</>}</p><p>Historical occurrences will remain available.</p></ConfirmDialog>}
  </>

  if (!global) return <section className="detail-panel follow-up-ticket-panel" aria-labelledby="follow-ups-heading"><div className="panel-heading"><div><h2 id="follow-ups-heading">Follow Ups</h2><p>Scheduled customer actions for this Ticket</p></div>{mayManage && <button className="button button-primary button-small" type="button" onClick={() => setDialog('create')}><Icon name="plus" size={16}/>Create Follow Up</button>}</div>{body}</section>

  return <div className="console-content follow-ups-page"><div className="page-heading"><div><span className="section-kicker">Customer action schedule</span><h1>Follow Ups</h1><p>Upcoming and historical Follow Ups from every Ticket you are authorised to access.</p></div><button className="button button-secondary" type="button" onClick={load} disabled={loading}>Refresh</button></div>{body}{mayManage && <button type="button" className="follow-up-fab" aria-label="Create follow-up" onClick={() => setDialog('create')}><Icon name="plus" size={24}/></button>}</div>
}
