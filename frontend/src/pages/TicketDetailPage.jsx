import { useCallback, useEffect, useState } from 'react'
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

function PostTicketDialog({ ticket, departments, busy, onClose, onSubmit }) {
  const [department, setDepartment] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const submit = (event) => {
    event.preventDefault()
    if (!department || department === ticket.currentDepartment) return setError('Select a different destination department.')
    onSubmit(department, note)
  }
  return <ModalShell title="Post Ticket" kicker="Department transfer request" onClose={onClose}>
    <p>The Ticket remains in <strong>{ticket.currentDepartment}</strong> until its responsible manager approves this request.</p>
    <form onSubmit={submit} noValidate>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <label className="field"><span>Requested next department</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Select department</option>{departments.filter((item) => item.slug !== ticket.currentDepartment).map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label className="field"><span>Request note <small>(optional)</small></span><textarea rows="4" maxLength="1000" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add helpful context for the manager"/></label>
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Submitting...' : 'Post Ticket'}</button></div>
    </form>
  </ModalShell>
}

function TicketOverview({ ticket, reference, mayUpdate, busy, onSave }) {
  const [form, setForm] = useState({ projectTitle: ticket.projectTitle, stage: ticket.stage, responsibleManagerId: ticket.responsibleManagerId })
  return <section className="detail-panel"><div className="panel-heading"><div><h2>Overview</h2><p>Pipeline stage and operational ownership</p></div></div>
    <div className="overview-grid">
      {mayUpdate && ticket.status === 'active' ? <form className="ticket-edit-form" onSubmit={(event) => { event.preventDefault(); onSave(form) }}>
        <label className="field"><span>Project title</span><input value={form.projectTitle} onChange={(event) => setForm({ ...form, projectTitle: event.target.value })}/></label>
        <label className="field"><span>Stage</span><select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{reference.stages.map((stage) => <option key={stage.slug} value={stage.slug}>{stage.name}</option>)}</select></label>
        <button className="button button-secondary button-small" disabled={busy || form.projectTitle.trim().length < 2}>Save updates</button>
      </form> : <dl className="overview-list"><div><dt>Project title</dt><dd>{ticket.projectTitle}</dd></div><div><dt>Stage</dt><dd><StatusBadge value={ticket.stage} kind="stage"/></dd></div></dl>}
      <dl className="overview-list"><div><dt>Company</dt><dd><button className="inline-link" onClick={() => navigate(`/console/cases/${ticket.caseId}`)}>{ticket.companyName}</button></dd></div><div><dt>Current department</dt><dd>{ticket.currentDepartment}</dd></div><div><dt>Responsible manager</dt><dd>{ticket.responsibleManagerName}</dd></div><div><dt>Assigned users</dt><dd>{ticket.assignedUsers.map((user) => user.name).join(', ') || 'No active assignments'}</dd></div><div><dt>Created</dt><dd>{formatDateTime(ticket.createdAt)}</dd></div><div><dt>Last updated</dt><dd>{formatDateTime(ticket.updatedAt)}</dd></div></dl>
    </div>
  </section>
}

export function TicketDetailPage({ ticketId }) {
  const { can } = useAuth()
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
  const mayClose = can(PERMISSIONS.TICKETS_CLOSE)
  const mayDelete = can(PERMISSIONS.TICKETS_DELETE_REQUEST)

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
    try { await operation(); setSuccess(message); setConfirmAction(''); setPostOpen(false); await after() }
    catch (operationError) { setError(operationError.message) }
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
  const pendingAssignment = ticket?.requests.some((request) => request.requestType === REQUEST_TYPES.ASSIGN_TO_ME && request.status === 'PENDING')
  const pendingPost = ticket?.requests.some((request) => request.requestType === REQUEST_TYPES.POST_TICKET && request.status === 'PENDING')
  const pendingDeletion = ticket?.requests.some((request) => request.requestType === REQUEST_TYPES.DELETE_TICKET && request.status === 'PENDING')
  const active = ticket?.status === 'active'

  if (loading) return <div className="console-content"><div className="loading-state panel-loading">Loading Ticket...</div></div>
  if (!ticket) return <div className="console-content"><div className="alert alert-error" role="alert">{error || 'Ticket not found.'}<button className="text-button" onClick={load}>Retry</button></div></div>
  const emails = contactMethods(ticket.contacts, 'email')
  const phones = contactMethods(ticket.contacts, 'phone')

  return <div className="console-content crm-detail ticket-detail">
    <button className="breadcrumb-link" onClick={() => navigate(`/console/cases/${ticket.caseId}`)}>← Back to {ticket.companyName}</button>
    <div className="ticket-hero"><div><span className="section-kicker">Ticket {ticket.id.slice(0, 8)}</span><h1>{ticket.projectTitle}</h1><p>{ticket.companyName}</p><div className="ticket-badges"><StatusBadge value={ticket.stage} kind="stage"/><StatusBadge value={ticket.status}/><StatusBadge value={ticket.currentDepartment} kind="department"/></div></div><div className="ticket-primary-actions"><button className="button button-secondary" disabled={!emails.length} onClick={() => openContact('email')} title={!emails.length ? 'No email address is available' : ''}><Icon name="mail" size={17}/>Email</button><button className="button button-secondary" disabled={!phones.length} onClick={() => openContact('phone')} title={!phones.length ? 'No phone number is available' : ''}><Icon name="phone" size={17}/>Call</button>{mayRequest && <button className="button button-secondary" disabled={!active || pendingAssignment} onClick={() => setConfirmAction('assign')}><Icon name="users" size={17}/>{pendingAssignment ? 'Assignment Pending' : 'Assign to Me'}</button>}{mayRequest && <button className="button button-primary" disabled={!active || pendingPost} onClick={() => setPostOpen(true)}><Icon name="send" size={17}/>{pendingPost ? 'Transfer Pending' : 'Post Ticket'}</button>}</div></div>
    {error && <div className="alert alert-error" role="alert">{error}<button className="text-button" onClick={() => setError('')}>Dismiss</button></div>}
    {success && <div className="alert alert-success" role="status">{success}</div>}
    {!active && <div className="closed-notice"><Icon name="lock" size={18}/><span>This Ticket is {ticket.status}. Its contacts, notes, requests, and history remain available, but working actions are restricted.</span></div>}
    <TicketOverview ticket={ticket} reference={reference} mayUpdate={mayUpdate} busy={busy} onSave={(input) => execute(() => caseTicketService.updateTicket(ticketId, input), 'Ticket updated. Its Leads or Customers placement now reflects the selected stage.')}/>
    <div className="ticket-sections-grid">
      <section className="detail-panel contacts-panel"><div className="panel-heading"><div><h2>Contacts</h2><p>{ticket.contacts.length} company contact(s)</p></div></div><div className="contact-list">{ticket.contacts.map((contact) => <article className="contact-card" key={contact.id}><span className="avatar">{contact.name[0].toUpperCase()}</span><div><strong>{contact.name}</strong>{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.phoneNumber && <a href={`tel:${contact.phoneNumber}`}>{contact.phoneNumber}</a>}</div></article>)}</div></section>
      <section className="detail-panel notes-panel"><div className="panel-heading"><div><h2>Notes</h2><p>Shared with authorised Ticket users</p></div></div>{mayNote && active && <form className="note-form" onSubmit={addNote}><label className="sr-only" htmlFor="new-ticket-note">Add Note</label><textarea id="new-ticket-note" rows="3" maxLength="5000" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a shared note..."/><button className="button button-primary button-small" disabled={busy || !note.trim()}><Icon name="plus" size={16}/>Add Note</button></form>}<div className="note-list">{ticket.notes.map((item) => <article className="note-card" key={item.id}><header><strong>{item.authorName}</strong><time>{formatDateTime(item.createdAt)}</time></header><p>{item.content}</p></article>)}{!ticket.notes.length && <div className="compact-empty">No notes have been added.</div>}</div></section>
    </div>
    <div className="ticket-sections-grid">
      <section className="detail-panel"><div className="panel-heading"><div><h2>Permission Requests</h2><p>Assignment, transfer, and deletion decisions</p></div></div><div className="history-list">{ticket.requests.map((request) => <article className="history-row" key={request.id}><span className="history-icon"><Icon name={request.requestType === REQUEST_TYPES.ASSIGN_TO_ME ? 'users' : request.requestType === REQUEST_TYPES.DELETE_TICKET ? 'trash' : 'send'} size={17}/></span><div><strong>{requestLabel(request.requestType)}</strong><p>{request.requestType === REQUEST_TYPES.DELETE_TICKET ? 'Requested Ticket deletion' : request.requestedDepartment ? `Requested ${request.requestedDepartment}` : 'Requested assignment'}{request.requestNote ? ` · ${request.requestNote}` : ''}</p><time>{formatDateTime(request.createdAt)}</time></div><StatusBadge value={request.status} kind="request"/></article>)}{!ticket.requests.length && <div className="compact-empty">No permission requests.</div>}</div></section>
      <section className="detail-panel"><div className="panel-heading"><div><h2>Activity</h2><p>Immutable Ticket workflow history</p></div></div><div className="history-list">{ticket.activity.map((activity) => <article className="history-row" key={activity.id}><span className="history-icon"><Icon name="activity" size={17}/></span><div><strong>{humanizeActivity(activity.action)}</strong><p>{activity.actorName}</p><time>{formatDateTime(activity.createdAt)}</time></div></article>)}</div></section>
    </div>
    {(mayClose || mayDelete) && <section className="danger-zone"><div><h2>Ticket controls</h2><p>Closing preserves the Ticket. Deletion requires responsible-manager approval.</p></div><div>{mayClose && <button className="button button-secondary" disabled={!active} onClick={() => setConfirmAction('close')}><Icon name="lock" size={17}/>Close Ticket</button>}{mayDelete && <button className="button button-danger" disabled={pendingDeletion} onClick={() => setConfirmAction('delete')}><Icon name="trash" size={17}/>{pendingDeletion ? 'Deletion Pending' : 'Delete Ticket'}</button>}</div></section>}
    {contactDialog && <ContactMethodDialog contacts={ticket.contacts} type={contactDialog} onClose={() => setContactDialog('')}/>} 
    {postOpen && <PostTicketDialog ticket={ticket} departments={reference.departments} busy={busy} onClose={() => setPostOpen(false)} onSubmit={(department, requestNote) => execute(() => caseTicketService.requestPost(ticketId, department, requestNote), 'Post Ticket request submitted to the responsible manager.')}/>} 
    {confirmAction === 'assign' && <ConfirmDialog title="Assign to Me" confirmLabel="Submit request" busy={busy} onClose={() => setConfirmAction('')} onConfirm={() => execute(() => caseTicketService.requestAssignment(ticketId), 'Assign to Me request submitted to the responsible manager.')}><p>This sends a permission request to <strong>{ticket.responsibleManagerName}</strong>. You will not be assigned until it is approved.</p></ConfirmDialog>}
    {confirmAction === 'close' && <ConfirmDialog title="Close Ticket" confirmLabel="Close Ticket" busy={busy} onClose={() => setConfirmAction('')} onConfirm={() => execute(() => caseTicketService.closeTicket(ticketId), 'Ticket closed. Its history and notes were preserved.')}><p>Close <strong>{ticket.projectTitle}</strong> for {ticket.companyName}?</p><p>Working actions will be disabled, but the Ticket remains viewable in history.</p></ConfirmDialog>}
    {confirmAction === 'delete' && <DeletionRequestDialog kind="ticket" name={ticket.projectTitle} companyName={ticket.companyName} responsibleManagerName={ticket.responsibleManagerName} busy={busy} onClose={() => setConfirmAction('')} onSubmit={({ note: requestNote }) => execute(() => caseTicketService.requestTicketDeletion(ticketId, requestNote), 'Delete Ticket request submitted to the responsible manager.')}/>} 
  </div>
}
