import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import { DeletionRequestDialog } from '../components/DeletionRequestDialog.jsx'
import { Icon } from '../components/Icons.jsx'
import { StatusBadge } from '../components/StatusBadge.jsx'
import { TicketCreationFlow } from '../components/TicketCreationFlow.jsx'
import { DEPARTMENTS, formatDateTime, TICKET_STAGES } from '../config/crm.js'
import { caseTicketService } from '../services/caseTicketService.js'
import { navigate } from '../utils/router.js'

function CaseCard({ item, mayCreate, mayDelete, onCreateTicket, onDelete }) {
  return (
    <article className="case-card">
      <header className="case-card-header">
        <div><span className="section-kicker">Company Case</span><h2>{item.companyName}</h2><p>Updated {formatDateTime(item.updatedAt)}</p></div>
        <div className="case-metrics"><span><strong>{item.ticketCount}</strong> Tickets</span><span><strong>{item.activeTicketCount}</strong> Active</span></div>
      </header>
      <div className="case-ticket-list">
        {item.tickets.map((ticket) => (
          <button className="ticket-summary-row" key={ticket.id} type="button" onClick={() => navigate(`/console/tickets/${ticket.id}`)}>
            <span className="ticket-summary-main"><strong>{ticket.projectTitle}</strong><small>{ticket.responsibleManagerName}</small></span>
            <span>{ticket.currentDepartment}</span><StatusBadge value={ticket.stage} kind="stage"/><StatusBadge value={ticket.status}/><Icon name="arrow" size={17}/>
          </button>
        ))}
      </div>
      <footer className="case-card-actions">
        <button className="button button-secondary button-small" type="button" onClick={() => navigate(`/console/cases/${item.id}`)}>View Case</button>
        {mayCreate && <button className="button button-primary button-small" type="button" onClick={() => onCreateTicket(item)}><Icon name="plus" size={16}/>Create Ticket</button>}
        {mayDelete && <button className="text-button danger-text" type="button" onClick={() => onDelete(item)}><Icon name="trash" size={16}/>Delete Case</button>}
      </footer>
    </article>
  )
}

export function CaseWorkspacePage({ area }) {
  const { can } = useAuth()
  const [cases, setCases] = useState([])
  const [reference, setReference] = useState({ departments: DEPARTMENTS, stages: TICKET_STAGES, managers: [] })
  const [filters, setFilters] = useState({ search: '', stage: '', department: '', sort: 'recent' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [creation, setCreation] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const mayCreate = can(PERMISSIONS.TICKETS_CREATE) && can(PERMISSIONS.CASES_CREATE)
  const mayDelete = can(PERMISSIONS.CASES_DELETE_REQUEST)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setCases(await caseTicketService.listCases({ area, ...filters })) }
    catch (loadError) { setError(loadError.message) }
    finally { setLoading(false) }
  }, [area, filters])

  useEffect(() => { caseTicketService.getReferenceData().then(setReference).catch(() => {}) }, [])
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer) }, [load])

  const requestCaseDeletion = async ({ managerId, note }) => {
    setDeleting(true); setError('')
    try {
      await caseTicketService.requestCaseDeletion(deleteTarget.id, managerId, note)
      setDeleteTarget(null)
      setSuccess(`Delete Case request submitted for ${deleteTarget.companyName}.`)
      await load()
    }
    catch (requestError) { setError(requestError.message); setDeleteTarget(null) }
    finally { setDeleting(false) }
  }

  const title = area === 'leads' ? 'Leads' : 'Customers'
  const areaStages = (reference.stages ?? TICKET_STAGES).filter((stage) => stage.businessArea === area)
  return (
    <div className="console-content crm-workspace">
      <div className="page-heading crm-heading"><div><span className="section-kicker">Case & Ticket Management</span><h1>{title}</h1><p>{area === 'leads' ? 'New and Open Tickets, organised by company Case.' : 'Qualified and later-stage customer work, organised by company Case.'}</p></div>{mayCreate && <button className="button button-primary" type="button" onClick={() => setCreation({})}><Icon name="plus" size={18}/>Create Ticket</button>}</div>
      {error && <div className="alert alert-error" role="alert">{error}<button className="text-button" onClick={load}>Retry</button></div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}
      <section className="filter-panel" aria-label={`${title} filters`}>
        <label className="search-field"><Icon name="search" size={18}/><span className="sr-only">Search</span><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search company, Ticket, contact, email or phone"/></label>
        <label><span className="sr-only">Stage</span><select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}><option value="">All stages</option>{areaStages.map((stage) => <option key={stage.slug} value={stage.slug}>{stage.name}</option>)}</select></label>
        <label><span className="sr-only">Department</span><select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{(reference.departments ?? DEPARTMENTS).map((department) => <option key={department.slug} value={department.slug}>{department.name}</option>)}</select></label>
        <label><span className="sr-only">Sort</span><select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="recent">Recently updated</option><option value="oldest">Oldest updated</option><option value="company">Company A–Z</option></select></label>
      </section>
      {loading ? <div className="loading-state panel-loading">Loading {title.toLowerCase()}...</div> : cases.length ? <div className="case-grid">{cases.map((item) => <CaseCard key={item.id} item={item} mayCreate={mayCreate} mayDelete={mayDelete} onCreateTicket={(selected) => setCreation(selected)} onDelete={setDeleteTarget}/>)}</div> : <div className="empty-state module-empty"><Icon name="briefcase" size={30}/><h2>No {title.toLowerCase()} match this view.</h2><p>Try changing the filters{mayCreate ? ' or create the first Ticket' : ''}.</p>{mayCreate && <button className="button button-primary" onClick={() => setCreation({})}>Create Ticket</button>}</div>}
      {creation && <TicketCreationFlow area={area} fixedCase={creation.id ? creation : null} onClose={() => setCreation(null)} onCreated={(result) => { setCreation(null); navigate(`/console/tickets/${result.ticketId}`) }}/>} 
      {deleteTarget && <DeletionRequestDialog kind="case" name={deleteTarget.companyName} ticketCount={deleteTarget.ticketCount} managers={reference.managers ?? []} busy={deleting} onClose={() => setDeleteTarget(null)} onSubmit={requestCaseDeletion}/>} 
    </div>
  )
}
