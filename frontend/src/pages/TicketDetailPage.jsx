import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import { ConfirmDialog } from '../components/ConfirmDialog.jsx'
import { ContactMethodDialog } from '../components/ContactMethodDialog.jsx'
import { DeletionRequestDialog } from '../components/DeletionRequestDialog.jsx'
import { Icon } from '../components/Icons.jsx'
import { ModalShell } from '../components/ModalShell.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { contactMethods, formatDateTime, humanizeActivity, REQUEST_TYPES, requestLabel } from '../config/crm.js'
import { caseTicketService } from '../services/caseTicketService.js'
import { navigate } from '../utils/router.js'

const TICKET_TABS = Object.freeze([
  ['overview', 'Overview'],
  ['contacts', 'Contacts'],
  ['notes', 'Notes'],
  ['activity', 'Activity'],
  ['permissions', 'Permissions'],
  ['timeline', 'Timeline'],
])

function PostTicketDialog({ ticket, departments, direct, busy, onClose, onSubmit }) {
  const [department, setDepartment] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const submit = (event) => {
    event.preventDefault()
    if (!department || department === ticket.currentDepartment) return setError('Select a different destination department.')
    onSubmit(department, note)
  }
  return <ModalShell title="Post Ticket" kicker={direct ? 'Direct manager action' : 'Manager approval required'} onClose={onClose}>
    <p>{direct ? 'This immediately transfers the Ticket. Transfers to Sales or Delivery also move lead-stage Tickets to Customers.' : <>The Ticket remains in <strong>{ticket.currentDepartment}</strong> until its responsible manager approves this request.</>}</p>
    <form onSubmit={submit} noValidate>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <label className="field"><span>Destination department</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setError('') }}><option value="">Select department</option>{departments.filter((item) => item.slug !== ticket.currentDepartment).map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="field"><span>{direct ? 'Transfer note' : 'Request note'} <small>(optional)</small></span><textarea rows="4" maxLength="1000" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add helpful context"/></label>
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Working...' : direct ? 'Confirm transfer' : 'Submit request'}</button></div>
    </form>
  </ModalShell>
}

function TicketOverview({ ticket, reference, mayUpdate, busy, onSave }) {
  const [form, setForm] = useState({ projectTitle: ticket.projectTitle, stage: ticket.stage, responsibleManagerId: ticket.responsibleManagerId })
  const eligibleManagers = reference.managers.filter((manager) => (
    ticket.currentDepartment === 'sales' ? manager.roleSlug === 'sales_manager'
      : ticket.currentDepartment === 'delivery' ? manager.roleSlug === 'delivery_manager'
        : ['sales_manager', 'delivery_manager'].includes(manager.roleSlug)
  ))
  const managerIsEligible = eligibleManagers.some((manager) => manager.id === form.responsibleManagerId)
  return <section className="detail-panel" aria-labelledby="overview-heading"><div className="panel-heading"><div><h2 id="overview-heading">Overview</h2><p>Pipeline stage and operational ownership</p></div></div>
    <div className="overview-grid">
      {mayUpdate && ticket.status === 'active' ? <form className="ticket-edit-form" onSubmit={(event) => { event.preventDefault(); onSave(form) }}>
        <label className="field"><span>Project title</span><input value={form.projectTitle} onChange={(event) => setForm({ ...form, projectTitle: event.target.value })}/></label>
        <label className="field"><span>Stage</span><select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{reference.stages.map((stage) => <option key={stage.slug} value={stage.slug}>{stage.name}</option>)}</select></label>
        <label className="field"><span>Responsible manager</span><select value={managerIsEligible ? form.responsibleManagerId : ''} onChange={(event) => setForm({ ...form, responsibleManagerId: event.target.value })}><option value="">Select Sales or Delivery Manager</option>{eligibleManagers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.roleSlug === 'sales_manager' ? 'Sales' : 'Delivery'}</option>)}</select>{!managerIsEligible && <small className="field-error">The existing manager is no longer eligible. Select a Sales or Delivery Manager before saving.</small>}</label>
        <button className="button button-secondary button-small" disabled={busy || form.projectTitle.trim().length < 2 || !managerIsEligible}>Save updates</button>
      </form> : <dl className="overview-list"><div><dt>Project title</dt><dd>{ticket.projectTitle}</dd></div><div><dt>Stage</dt><dd><StatusBadge value={ticket.stage} kind="stage"/></dd></div></dl>}
      <dl className="overview-list"><div><dt>Company</dt><dd><button className="inline-link" onClick={() => navigate(`/console/cases/${ticket.caseId}`)}>{ticket.companyName}</button></dd></div><div><dt>Current department</dt><dd>{ticket.currentDepartment}</dd></div><div><dt>Responsible manager</dt><dd>{ticket.responsibleManagerName}</dd></div><div><dt>Assigned users</dt><dd>{ticket.assignedUsers.map((user) => user.name).join(', ') || 'No active assignments'}</dd></div><div><dt>Created</dt><dd>{formatDateTime(ticket.createdAt)}</dd></div><div><dt>Last updated</dt><dd>{formatDateTime(ticket.updatedAt)}</dd></div></dl>
    </div>
  </section>
}

function ContactsTab({ ticket }) {
  return <section className="detail-panel" aria-labelledby="contacts-heading"><div className="panel-heading"><div><h2 id="contacts-heading">Contacts</h2><p>{ticket.contacts.length} company contact(s)</p></div></div><div className="contact-list">{ticket.contacts.map((contact) => <article className="contact-card" key={contact.id}><span className="avatar">{contact.name[0].toUpperCase()}</span><div><strong>{contact.name}</strong>{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.phoneNumber && <a href={`tel:${contact.phoneNumber}`}>{contact.phoneNumber}</a>}</div></article>)}</div></section>
}

function NotesTab({ ticket, mayNote, active, note, setNote, busy, onSubmit }) {
  return <section className="detail-panel" aria-labelledby="notes-heading"><div className="panel-heading"><div><h2 id="notes-heading">Notes</h2><p>Shared with authorised Ticket users</p></div></div>{mayNote && active && <form className="note-form" onSubmit={onSubmit}><label className="sr-only" htmlFor="new-ticket-note">Add Note</label><textarea id="new-ticket-note" rows="3" maxLength="5000" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a shared note..."/><button className="button button-primary button-small" disabled={busy || !note.trim()}><Icon name="plus" size={16}/>Add Note</button></form>}<div className="note-list">{ticket.notes.map((item) => <article className="note-card" key={item.id}><header><strong>{item.authorName}</strong><time>{formatDateTime(item.createdAt)}</time></header><p>{item.content}</p></article>)}{!ticket.notes.length && <div className="compact-empty">No notes have been added.</div>}</div></section>
}

function ActivityTab({ ticket }) {
  return <section className="detail-panel" aria-labelledby="activity-heading"><div className="panel-heading"><div><h2 id="activity-heading">Activity</h2><p>Immutable Ticket workflow history</p></div></div><div className="history-list">{ticket.activity.map((activity) => <article className="history-row" key={activity.id}><span className="history-icon"><Icon name="activity" size={17}/></span><div><strong>{humanizeActivity(activity.action)}</strong><p>{activity.actorName}</p><time>{formatDateTime(activity.createdAt)}</time></div></article>)}</div></section>
}

function PermissionsTab({ ticket }) {
  return <section className="detail-panel" aria-labelledby="permissions-heading"><div className="panel-heading"><div><h2 id="permissions-heading">Permission Requests</h2><p>Assignment, transfer, and deletion decisions</p></div></div><div className="history-list">{ticket.requests.map((request) => <article className="history-row" key={request.id}><span className="history-icon"><Icon name={request.requestType === REQUEST_TYPES.ASSIGN_TO_ME ? 'users' : request.requestType === REQUEST_TYPES.DELETE_TICKET ? 'trash' : 'send'} size={17}/></span><div><strong>{requestLabel(request.requestType)}</strong><p>{request.requestType === REQUEST_TYPES.DELETE_TICKET ? 'Requested Ticket deletion' : request.requestedDepartment ? `Requested ${request.requestedDepartment}` : 'Requested assignment'}{request.requestNote ? ` · ${request.requestNote}` : ''}</p><time>{formatDateTime(request.createdAt)}</time></div><StatusBadge value={request.status} kind="request"/></article>)}{!ticket.requests.length && <div className="compact-empty">No permission requests.</div>}</div></section>
}

function PlaceholderTab({ title, copy }) {
  return <section className="detail-panel placeholder-panel"><Icon name="activity" size={28}/><h2>{title}</h2><p>{copy}</p></section>
}

export function TicketDetailPage({ ticketId }) {
  const { can } = useAuth()
  const tabRefs = useRef([])
  const [activeTab, setActiveTab] = useState('overview')
  const [ticket, setTicket] = useState(null)
  const [reference, setReference] = useState({ departments: [], stages: [], managers: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [note, setNote] = useState('')
  const [contactDialog, setContactDialog] = useState('')
  const [postOpen, setPostOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState('')
  const mayUpdate = can(PERMISSIONS.TICKETS_UPDATE)
  const mayNote = can(PERMISSIONS.TICKET_NOTES_CREATE)
  const mayRequest = can(PERMISSIONS.TICKET_REQUESTS_CREATE)
  const mayDirectManage = can(PERMISSIONS.TICKET_REQUESTS_REVIEW)
  const mayClose = can(PERMISSIONS.TICKETS_CLOSE)
  const mayDelete = can(PERMISSIONS.TICKETS_DELETE_REQUEST)
  const mayDirectDelete = can(PERMISSIONS.TICKETS_DELETE)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [ticketData, referenceData] = await Promise.all([caseTicketService.getTicket(ticketId), caseTicketService.getReferenceData()])
      setTicket(ticketData); setReference(referenceData)
    } catch (loadError) { setError(loadError.message) }
    finally { setLoading(false) }
  }, [ticketId])
  useEffect(() => { load() }, [load])

  const execute = async (operation, message, after = load) => {
    setBusy(true); setError(''); setSuccess('')
    try {
      const result = await operation()
      setSuccess(typeof message === 'function' ? message(result) : message)
      setConfirmAction(''); setPostOpen(false)
      await after(result)
      return result
    } catch (operationError) { setError(operationError.message); return null }
    finally { setBusy(false) }
  }
  const openContact = (type) => {
    const methods = contactMethods(ticket.contacts, type)
    if (methods.length === 1) window.location.href = `${type === 'email' ? 'mailto' : 'tel'}:${methods[0].value}`
    else if (methods.length > 1) setContactDialog(type)
  }
  const addNote = async (event) => {
    event.preventDefault()
    if (!note.trim()) return setError('Note content is required.')
    await execute(() => caseTicketService.addNote(ticketId, note), 'Note added.', async () => { setNote(''); await load() })
  }
  const afterDirectDeletion = async (result) => {
    if (result?.mode === 'direct' && result.archived) {
      navigate(`/console/cases/${ticket.caseId}`)
      return
    }
    await load()
  }
  const selectAdjacentTab = (event, index) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TICKET_TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TICKET_TABS.length) % TICKET_TABS.length
    setActiveTab(TICKET_TABS[next][0]); tabRefs.current[next]?.focus()
  }

  if (loading) return <div className="console-content"><div className="loading-state panel-loading">Loading Ticket...</div></div>
  if (!ticket) return <div className="console-content"><div className="alert alert-error" role="alert">{error || 'Ticket not found.'}<button className="text-button" onClick={load}>Retry</button></div></div>
  const emails = contactMethods(ticket.contacts, 'email')
  const phones = contactMethods(ticket.contacts, 'phone')
  const pendingAssignment = ticket.requests.some((request) => request.requestType === REQUEST_TYPES.ASSIGN_TO_ME && request.status === 'PENDING')
  const pendingPost = ticket.requests.some((request) => request.requestType === REQUEST_TYPES.POST_TICKET && request.status === 'PENDING')
  const pendingDeletion = ticket.requests.some((request) => request.requestType === REQUEST_TYPES.DELETE_TICKET && request.status === 'PENDING')
  const active = ticket.status === 'active'

  return <div className="console-content crm-detail ticket-detail">
    <button className="breadcrumb-link" onClick={() => navigate(`/console/cases/${ticket.caseId}`)}>&larr; Back to {ticket.companyName}</button>
    <header className="ticket-hero">
      <div className="ticket-heading">
        <span className="section-kicker">Ticket {ticket.id.slice(0, 8)}</span>
        <h1>{ticket.projectTitle}</h1>
        <p>{ticket.companyName} · Managed by {ticket.responsibleManagerName}</p>
        <p className="ticket-assignees">Assigned: {ticket.assignedUsers.map((user) => user.name).join(', ') || 'No active assignments'}</p>
        <div className="ticket-badges"><StatusBadge value={ticket.stage} kind="stage"/><StatusBadge value={ticket.status}/><StatusBadge value={ticket.currentDepartment} kind="department"/></div>
      </div>
      <div className="ticket-primary-actions">
        <button className="button button-secondary" disabled={!emails.length} onClick={() => openContact('email')} title={!emails.length ? 'No email address is available' : ''}><Icon name="mail" size={17}/>Email</button>
        <button className="button button-secondary" disabled={!phones.length} onClick={() => openContact('phone')} title={!phones.length ? 'No phone number is available' : ''}><Icon name="phone" size={17}/>Call</button>
        {mayRequest && <button className="button button-secondary" disabled={!active || pendingAssignment} onClick={() => setConfirmAction('assign')}><Icon name="users" size={17}/>{pendingAssignment ? 'Assignment Pending' : 'Assign to Me'}</button>}
        {mayRequest && <button className="button button-primary" disabled={!active || pendingPost} onClick={() => setPostOpen(true)}><Icon name="send" size={17}/>{pendingPost ? 'Transfer Pending' : 'Post Ticket'}</button>}
        {(mayClose || mayDelete) && <details className="ticket-action-menu"><summary className="button button-secondary" aria-label="More Ticket actions">More</summary><div>{mayClose && <button disabled={!active} onClick={() => setConfirmAction('close')}><Icon name="lock" size={16}/>Close Ticket</button>}{mayDelete && <button className="danger-text" disabled={pendingDeletion} onClick={() => setConfirmAction('delete')}><Icon name="trash" size={16}/>{pendingDeletion ? 'Deletion Pending' : 'Delete Ticket'}</button>}</div></details>}
      </div>
    </header>
    {error && <div className="alert alert-error" role="alert">{error}<button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
    {success && <div className="alert alert-success" role="status">{success}</div>}
    {!active && <div className="closed-notice"><Icon name="lock" size={18}/><span>This Ticket is {ticket.status}. Its contacts, notes, requests, and history remain available, but working actions are restricted.</span></div>}
    <nav className="ticket-tabs" role="tablist" aria-label="Ticket details">{TICKET_TABS.map(([slug, label], index) => <button key={slug} ref={(node) => { tabRefs.current[index] = node }} id={`ticket-tab-${slug}`} role="tab" aria-selected={activeTab === slug} aria-controls={`ticket-panel-${slug}`} tabIndex={activeTab === slug ? 0 : -1} className={activeTab === slug ? 'active' : ''} onClick={() => setActiveTab(slug)} onKeyDown={(event) => selectAdjacentTab(event, index)}>{label}</button>)}</nav>
    <div id={`ticket-panel-${activeTab}`} role="tabpanel" aria-labelledby={`ticket-tab-${activeTab}`} className="ticket-tab-panel">
      {activeTab === 'overview' && <TicketOverview ticket={ticket} reference={reference} mayUpdate={mayUpdate} busy={busy} onSave={(input) => execute(() => caseTicketService.updateTicket(ticketId, input), 'Ticket updated.')}/>}
      {activeTab === 'contacts' && <ContactsTab ticket={ticket}/>}
      {activeTab === 'notes' && <NotesTab ticket={ticket} mayNote={mayNote} active={active} note={note} setNote={setNote} busy={busy} onSubmit={addNote}/>}
      {activeTab === 'activity' && <ActivityTab ticket={ticket}/>}
      {activeTab === 'permissions' && <PermissionsTab ticket={ticket}/>}
      {activeTab === 'timeline' && <PlaceholderTab title="Timeline" copy="A unified customer timeline is planned for a future release. No additional data is loaded for this placeholder."/>}
    </div>
    {contactDialog && <ContactMethodDialog contacts={ticket.contacts} type={contactDialog} onClose={() => setContactDialog('')}/>} 
    {postOpen && <PostTicketDialog ticket={ticket} departments={reference.departments} direct={mayDirectManage} busy={busy} onClose={() => setPostOpen(false)} onSubmit={(department, requestNote) => execute(() => caseTicketService.requestPost(ticketId, department, requestNote), (result) => result?.mode === 'direct' ? `Ticket transferred to ${department}${result.businessArea === 'customers' ? ' and moved to Customers' : ''}.` : 'Post Ticket request submitted to the responsible manager.')}/>}
    {confirmAction === 'assign' && <ConfirmDialog title="Assign to Me" confirmLabel={mayDirectManage ? 'Confirm assignment' : 'Submit request'} busy={busy} onClose={() => setConfirmAction('')} onConfirm={() => execute(() => caseTicketService.requestAssignment(ticketId), (result) => result?.mode === 'direct' ? 'You are now assigned to this Ticket.' : 'Assign to Me request submitted to the responsible manager.')}><p>{mayDirectManage ? <>You have manager authority, so this assigns <strong>you</strong> immediately and records the action.</> : <>This sends a permission request to <strong>{ticket.responsibleManagerName}</strong>. You will not be assigned until it is approved.</>}</p></ConfirmDialog>}
    {confirmAction === 'close' && <ConfirmDialog title="Close Ticket" confirmLabel="Close Ticket" busy={busy} onClose={() => setConfirmAction('')} onConfirm={() => execute(() => caseTicketService.closeTicket(ticketId), 'Ticket closed. Its history and notes were preserved.')}><p>Close <strong>{ticket.projectTitle}</strong> for {ticket.companyName}?</p><p>Working actions will be disabled, but the Ticket remains viewable in history.</p></ConfirmDialog>}
    {confirmAction === 'delete' && (mayDirectDelete ? <ConfirmDialog title="Delete Ticket" confirmLabel="Delete Ticket" danger busy={busy} onClose={() => setConfirmAction('')} onConfirm={() => execute(() => caseTicketService.requestTicketDeletion(ticketId), (result) => result?.mode === 'direct' ? 'Ticket archived.' : 'Delete Ticket request submitted.', afterDirectDeletion)}><p>Archive <strong>{ticket.projectTitle}</strong> now?</p><p>This direct manager action preserves the audit trail and cannot be undone from the application.</p></ConfirmDialog> : <DeletionRequestDialog kind="ticket" name={ticket.projectTitle} companyName={ticket.companyName} responsibleManagerName={ticket.responsibleManagerName} busy={busy} onClose={() => setConfirmAction('')} onSubmit={({ note: requestNote }) => execute(() => caseTicketService.requestTicketDeletion(ticketId, requestNote), 'Delete Ticket request submitted to the responsible manager.')}/>) }
  </div>
}
