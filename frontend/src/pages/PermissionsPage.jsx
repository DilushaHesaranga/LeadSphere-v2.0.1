import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../components/Icons.jsx'
import { ModalShell } from '../components/ModalShell.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { formatDateTime, REQUEST_STATUSES, REQUEST_TYPES, requestLabel } from '../config/crm.js'
import { caseTicketService } from '../services/caseTicketService.js'
import { navigate } from '../utils/router.js'

const views = [...REQUEST_STATUSES, 'ALL']
const deletionTypes = new Set([REQUEST_TYPES.DELETE_TICKET, REQUEST_TYPES.DELETE_CASE])

function DecisionDialog({ request, decision, reference, busy, onClose, onConfirm }) {
  const [comment, setComment] = useState('')
  const [assigneeId, setAssigneeId] = useState(request.requestedAssigneeId ?? '')
  const [department, setDepartment] = useState(request.requestedDepartment ?? '')
  const modified = decision === 'MODIFIED'
  const deletion = deletionTypes.has(request.requestType)
  const title = decision === 'APPROVED' ? 'Accept request' : decision === 'REJECTED' ? 'Reject request' : 'Modify request'
  const valid = !modified || (request.requestType === REQUEST_TYPES.ASSIGN_TO_ME ? Boolean(assigneeId) : Boolean(department && department !== request.currentDepartment))
  const decisionCopy = decision === 'APPROVED'
    ? deletion ? 'The record will be archived atomically with this approval.' : 'The requested change will be applied atomically with this approval.'
    : decision === 'REJECTED'
      ? deletion ? 'The record will remain unchanged.' : 'No assignment or department change will be applied.'
      : 'The original request remains in history alongside your approved modification.'

  return <ModalShell title={title} kicker={`${requestLabel(request.requestType)} · ${request.ticketTitle}`} onClose={onClose}>
    <div className="decision-summary"><span>{request.companyName}</span><strong>{request.requesterName}</strong><p>{decisionCopy}</p></div>
    {modified && request.requestType === REQUEST_TYPES.ASSIGN_TO_ME && <label className="field"><span>Approved assignee</span><select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Select assignee</option>{reference.assignees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {modified && request.requestType === REQUEST_TYPES.POST_TICKET && <label className="field"><span>Approved destination department</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Select department</option>{reference.departments.filter((item) => item.slug !== request.currentDepartment).map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select><small>Originally requested: {request.requestedDepartment}</small></label>}
    <label className="field"><span>Manager comment <small>(optional)</small></span><textarea rows="3" maxLength="1000" value={comment} onChange={(event) => setComment(event.target.value)}/></label>
    <div className="modal-actions"><button className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className={`button ${decision === 'REJECTED' ? 'button-danger' : 'button-primary'}`} disabled={busy || !valid} onClick={() => onConfirm({ comment, assigneeId: modified ? assigneeId : '', department: modified ? department : '' })}>{busy ? 'Saving decision...' : decision === 'APPROVED' ? 'Accept' : decision === 'REJECTED' ? 'Reject' : 'Modify'}</button></div>
  </ModalShell>
}

export function PermissionsPage() {
  const [view, setView] = useState('PENDING')
  const [requests, setRequests] = useState([])
  const [reference, setReference] = useState({ departments: [], assignees: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [decision, setDecision] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setRequests(await caseTicketService.listRequests(view)) }
    catch (loadError) { setError(loadError.message) }
    finally { setLoading(false) }
  }, [view])
  useEffect(() => { load() }, [load])
  useEffect(() => { caseTicketService.getReferenceData().then(setReference).catch((loadError) => setError(loadError.message)) }, [])

  const review = async (options) => {
    setBusy(true); setError(''); setSuccess('')
    try {
      await caseTicketService.reviewRequest(decision.request.id, decision.type, options)
      window.dispatchEvent(new Event('leadsphere:permissions-changed'))
      setSuccess(`${requestLabel(decision.request.requestType)} request ${decision.type.toLowerCase()}.`)
      setDecision(null)
      await load()
    } catch (reviewError) { setError(reviewError.message) }
    finally { setBusy(false) }
  }

  return <div className="console-content permissions-page">
    <div className="page-heading"><div><span className="section-kicker">Manager review queue</span><h1>Permissions</h1><p>Review assignment, department-transfer, and deletion requests routed to you.</p></div><button className="button button-secondary" onClick={load} disabled={loading}>Refresh</button></div>
    <div className="permission-tabs" role="tablist" aria-label="Permission request status">{views.map((status) => <button key={status} role="tab" aria-selected={view === status} className={view === status ? 'active' : ''} onClick={() => setView(status)}>{status === 'ALL' ? 'All' : status[0] + status.slice(1).toLowerCase()}</button>)}</div>
    {error && <div className="alert alert-error" role="alert">{error}<button className="text-button" onClick={load}>Retry</button></div>}
    {success && <div className="alert alert-success" role="status">{success}</div>}
    {loading ? <div className="loading-state panel-loading">Loading permission requests...</div> : requests.length ? <div className="permission-list">{requests.map((request) => {
      const approvedAssignee = reference.assignees.find((item) => item.id === request.managerModifiedData?.approvedAssigneeId)?.name
      const modifiedOutcome = request.managerModifiedData?.approvedDepartment || approvedAssignee
      const deletion = deletionTypes.has(request.requestType)
      const requestedLabel = request.requestType === REQUEST_TYPES.ASSIGN_TO_ME ? 'Requested assignee' : request.requestType === REQUEST_TYPES.POST_TICKET ? 'Requested department' : 'Requested action'
      const requestedValue = request.requestedAssigneeName || request.requestedDepartment || requestLabel(request.requestType)
      const destination = request.requestType === REQUEST_TYPES.DELETE_CASE ? `/console/cases/${request.caseId}` : `/console/tickets/${request.ticketId}`
      return <article className="permission-card" key={request.id}>
        <header><span className="request-type"><Icon name={request.requestType === REQUEST_TYPES.ASSIGN_TO_ME ? 'users' : deletion ? 'trash' : 'send'} size={18}/>{requestLabel(request.requestType)}</span><StatusBadge value={request.status} kind="request"/></header>
        <div className="permission-card-main"><div><span className="section-kicker">{request.companyName}</span><h2>{request.ticketTitle}</h2><p>Requested by <strong>{request.requesterName}</strong> · {formatDateTime(request.createdAt)}</p></div><dl><div><dt>Current department</dt><dd>{request.currentDepartment || 'Not applicable'}</dd></div><div><dt>{requestedLabel}</dt><dd>{requestedValue}</dd></div><div><dt>Responsible manager</dt><dd>{request.responsibleManagerName}</dd></div>{modifiedOutcome && <div><dt>Manager-approved change</dt><dd>{modifiedOutcome}</dd></div>}</dl></div>
        {request.requestNote && <div className="request-note"><strong>Request note</strong><p>{request.requestNote}</p></div>}
        {request.managerComment && <div className="request-note"><strong>Manager comment</strong><p>{request.managerComment}</p></div>}
        <footer><button className="button button-secondary button-small" onClick={() => navigate(destination)}>{request.requestType === REQUEST_TYPES.DELETE_CASE ? 'View Case' : 'View Ticket'}</button>{request.status === 'PENDING' && <div className="review-actions"><button className="button button-secondary button-small" onClick={() => setDecision({ request, type: 'REJECTED' })}>Reject</button>{!deletion && <button className="button button-secondary button-small" onClick={() => setDecision({ request, type: 'MODIFIED' })}>Modify</button>}<button className="button button-primary button-small" onClick={() => setDecision({ request, type: 'APPROVED' })}>Accept</button></div>}</footer>
      </article>
    })}</div> : <div className="empty-state module-empty"><Icon name="shield" size={30}/><h2>No {view === 'ALL' ? '' : view.toLowerCase()} permission requests.</h2><p>Reviewed requests move automatically into their history category.</p></div>}
    {decision && <DecisionDialog request={decision.request} decision={decision.type} reference={reference} busy={busy} onClose={() => setDecision(null)} onConfirm={review}/>} 
  </div>
}
