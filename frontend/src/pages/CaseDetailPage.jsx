import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import { DeletionRequestDialog } from '../components/DeletionRequestDialog.jsx'
import { Icon } from '../components/Icons.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { TicketCreationFlow } from '../components/TicketCreationFlow.jsx'
import { formatDateTime } from '../config/crm.js'
import { caseTicketService } from '../services/caseTicketService.js'
import { navigate } from '../utils/router.js'

export function CaseDetailPage({ caseId }) {
  const { can } = useAuth()
  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [creationOpen, setCreationOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reference, setReference] = useState({ managers: [] })
  const [busy, setBusy] = useState(false)
  const mayCreate = can(PERMISSIONS.TICKETS_CREATE)
  const mayDelete = can(PERMISSIONS.CASES_DELETE_REQUEST)
  const load = useCallback(async () => { setLoading(true); setError(''); try { const [nextCase, nextReference] = await Promise.all([caseTicketService.getCase(caseId), caseTicketService.getReferenceData()]); setCaseData(nextCase); setReference(nextReference) } catch (loadError) { setError(loadError.message) } finally { setLoading(false) } }, [caseId])
  useEffect(() => { load() }, [load])
  const requestDeletion = async ({ managerId, note }) => { setBusy(true); try { await caseTicketService.requestCaseDeletion(caseId, managerId, note); setConfirmDelete(false); setError(''); setSuccess('Delete Case request submitted to the selected manager.'); setBusy(false) } catch (requestError) { setError(requestError.message); setConfirmDelete(false); setBusy(false) } }
  if (loading) return <div className="console-content"><div className="loading-state panel-loading">Loading Case...</div></div>
  if (error && !caseData) return <div className="console-content"><div className="alert alert-error" role="alert">{error}<button className="text-button" onClick={load}>Retry</button></div></div>
  return <div className="console-content crm-detail">
    <button className="breadcrumb-link" onClick={() => navigate('/console/leads')}>← Back to Cases</button>
    <div className="page-heading crm-heading"><div><span className="section-kicker">Company Case</span><h1>{caseData.companyName}</h1><p>Created {formatDateTime(caseData.createdAt)} · Updated {formatDateTime(caseData.updatedAt)}</p></div><div className="heading-actions">{mayCreate && <button className="button button-primary" onClick={() => setCreationOpen(true)}><Icon name="plus" size={18}/>Create Ticket</button>}{mayDelete && <button className="button button-secondary danger-text" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={17}/>Delete Case</button>}</div></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {success && <div className="alert alert-success" role="status">{success}</div>}
    <section className="detail-panel"><div className="panel-heading"><div><h2>Tickets</h2><p>{caseData.tickets.length} project engagement(s)</p></div></div>{caseData.tickets.length ? <div className="detail-ticket-list">{caseData.tickets.map((ticket) => <article key={ticket.id} className="detail-ticket-card"><div><span className="section-kicker">Ticket {ticket.id.slice(0, 8)}</span><h3>{ticket.projectTitle}</h3><p>Responsible manager: {ticket.responsibleManagerName}</p></div><dl><div><dt>Stage</dt><dd><StatusBadge value={ticket.stage} kind="stage"/></dd></div><div><dt>Status</dt><dd><StatusBadge value={ticket.status}/></dd></div><div><dt>Department</dt><dd>{ticket.currentDepartment}</dd></div><div><dt>Assigned users</dt><dd>{ticket.assignedUsers.map((user) => user.name).join(', ') || 'None'}</dd></div><div><dt>Last updated</dt><dd>{formatDateTime(ticket.updatedAt)}</dd></div></dl><button className="button button-secondary button-small" onClick={() => navigate(`/console/tickets/${ticket.id}`)}>View Ticket</button></article>)}</div> : <div className="panel-empty">This Case has no active Tickets.</div>}</section>
    {creationOpen && <TicketCreationFlow fixedCase={{ id: caseData.id, companyName: caseData.companyName }} onClose={() => setCreationOpen(false)} onCreated={(result) => navigate(`/console/tickets/${result.ticketId}`)}/>} 
    {confirmDelete && <DeletionRequestDialog kind="case" name={caseData.companyName} ticketCount={caseData.tickets.length} managers={reference.managers ?? []} busy={busy} onClose={() => setConfirmDelete(false)} onSubmit={requestDeletion}/>} 
  </div>
}
