import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import { canSelectInitialDepartment, DEPARTMENTS, getDefaultDepartment, prepareContacts, TICKET_STAGES, validateCase, validateTicket } from '../config/crm.js'
import { caseTicketService } from '../services/caseTicketService.js'
import { Icon } from './Icons.jsx'
import { ModalShell } from './ModalShell.jsx'

const emptyContact = () => ({ name: '', email: '', phoneNumber: '' })

function FieldError({ children, id }) {
  return children ? <small id={id} className="field-error">{children}</small> : null
}

export function TicketCreationFlow({ area = 'leads', fixedCase = null, onClose, onCreated }) {
  const { can, roles } = useAuth()
  const defaultDepartment = getDefaultDepartment(roles)
  const maySelectDepartment = canSelectInitialDepartment(roles)
  const mayAssignPeople = can(PERMISSIONS.TICKET_REQUESTS_REVIEW)
  const [step, setStep] = useState(fixedCase ? 'ticket' : 'choice')
  const [companyName, setCompanyName] = useState(fixedCase?.companyName ?? '')
  const [selectedCase, setSelectedCase] = useState(fixedCase)
  const [caseSearch, setCaseSearch] = useState('')
  const [caseMatches, setCaseMatches] = useState([])
  const [duplicateMatches, setDuplicateMatches] = useState([])
  const [reference, setReference] = useState({ departments: DEPARTMENTS, stages: TICKET_STAGES, managers: [], assignees: [], departmentManagers: [] })
  const [ticket, setTicket] = useState({
    projectTitle: '', currentDepartment: defaultDepartment,
    stage: area === 'leads' ? 'qualification' : 'sales_order', responsibleManagerId: '', assigneeIds: [], contacts: [emptyContact()],
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    caseTicketService.getReferenceData().then((data) => {
      setReference({
        departments: data.departments?.length ? data.departments : DEPARTMENTS,
        stages: data.stages?.length ? data.stages.map((stage) => ({ ...TICKET_STAGES.find((item) => item.slug === stage.slug), ...stage })) : TICKET_STAGES,
        managers: data.managers ?? [],
        assignees: data.assignees ?? [],
        departmentManagers: data.departmentManagers ?? [],
      })
    }).catch((error) => setNotice(error.message))
  }, [])

  const eligibleManagers = useMemo(() => reference.managers.filter((manager) => (
    ticket.currentDepartment === 'sales' ? manager.roleSlug === 'sales_manager'
      : ticket.currentDepartment === 'delivery' ? manager.roleSlug === 'delivery_manager'
        : ['sales_manager', 'delivery_manager'].includes(manager.roleSlug)
  )), [reference.managers, ticket.currentDepartment])
  const resolvedManager = useMemo(() => {
    const mappedId = reference.departmentManagers.find((item) => item.department === ticket.currentDepartment)?.managerId ?? ''
    return eligibleManagers.some((manager) => manager.id === mappedId) ? mappedId : eligibleManagers.length === 1 ? eligibleManagers[0].id : ''
  }, [eligibleManagers, reference.departmentManagers, ticket.currentDepartment])
  useEffect(() => {
    if (!ticket.responsibleManagerId && resolvedManager) setTicket((current) => ({ ...current, responsibleManagerId: resolvedManager }))
  }, [resolvedManager, ticket.responsibleManagerId])

  const searchCases = useCallback(async (value = caseSearch) => {
    setLoading(true); setNotice('')
    try { setCaseMatches(await caseTicketService.findCases(value)) }
    catch (error) { setNotice(error.message) }
    finally { setLoading(false) }
  }, [caseSearch])

  const proceedWithNewCase = async () => {
    const validation = validateCase(companyName)
    setErrors(validation)
    if (Object.keys(validation).length) return
    setLoading(true); setNotice('')
    try {
      const matches = await caseTicketService.findCases(companyName.trim())
      if (matches.length && !duplicateMatches.length) { setDuplicateMatches(matches); return }
      setSelectedCase({ id: '', companyName: companyName.trim() })
      setStep('ticket')
    } catch (error) { setNotice(error.message) }
    finally { setLoading(false) }
  }

  const chooseExisting = (item) => { setSelectedCase(item); setCompanyName(item.companyName); setStep('ticket') }

  const updateContact = (index, key, value) => setTicket((current) => ({
    ...current,
    contacts: current.contacts.map((contact, contactIndex) => contactIndex === index ? { ...contact, [key]: value } : contact),
  }))

  const toggleAssignee = (userId) => setTicket((current) => ({
    ...current,
    assigneeIds: current.assigneeIds.includes(userId)
      ? current.assigneeIds.filter((id) => id !== userId)
      : [...current.assigneeIds, userId],
  }))

  const submit = async (event) => {
    event.preventDefault()
    const payload = { ...ticket, caseId: selectedCase?.id || 'new-case' }
    const validation = validateTicket(payload)
    setErrors(validation)
    if (Object.keys(validation).length) return
    setLoading(true); setNotice('')
    try {
      const input = { ...ticket, companyName: companyName.trim(), caseId: selectedCase?.id, contacts: prepareContacts(ticket.contacts) }
      const result = selectedCase?.id ? await caseTicketService.createTicket(input) : await caseTicketService.createCaseAndTicket(input)
      onCreated(result)
    } catch (error) { setNotice(error.message); setLoading(false) }
  }

  const title = step === 'choice' ? 'Create Ticket' : step === 'new-case' ? 'Create New Case' : step === 'existing-case' ? 'Use Existing Case' : 'Ticket details'

  return (
    <ModalShell title={title} kicker="Case & Ticket Management" onClose={onClose} wide>
      {notice && <div className="alert alert-error" role="alert">{notice}</div>}
      <div className="flow-steps" aria-label="Creation progress">
        <span className={step !== 'choice' ? 'complete' : 'active'}>1. Case</span><i />
        <span className={step === 'ticket' ? 'active' : ''}>2. Ticket</span>
      </div>

      {step === 'choice' && <div className="choice-grid">
        <button className="choice-card" type="button" onClick={() => setStep('new-case')}><Icon name="plus"/><strong>Create New Case</strong><span>Add a company and its first project Ticket.</span></button>
        <button className="choice-card" type="button" onClick={() => setStep('existing-case')}><Icon name="briefcase"/><strong>Use Existing Case</strong><span>Add another Ticket without re-entering company details.</span></button>
      </div>}

      {step === 'new-case' && <div className="flow-section">
        <p>Start with the company. LeadSphere checks for likely duplicates before creating it.</p>
        <label className="field"><span>Company name</span><input value={companyName} onChange={(event) => { setCompanyName(event.target.value); setDuplicateMatches([]) }} aria-describedby="company-error" autoFocus/><FieldError id="company-error">{errors.companyName}</FieldError></label>
        {duplicateMatches.length > 0 && <div className="duplicate-warning" role="alert"><strong>Possible existing {duplicateMatches.length === 1 ? 'Case' : 'Cases'} found</strong><p>Use the existing Case when it represents the same company.</p>{duplicateMatches.map((item) => <button key={item.id} type="button" className="duplicate-option" onClick={() => chooseExisting(item)}><span>{item.companyName}</span><small>{item.ticketCount} Ticket(s)</small></button>)}<button className="text-button" type="button" onClick={() => { setDuplicateMatches([]); setSelectedCase({ id: '', companyName: companyName.trim() }); setStep('ticket') }}>Create a separate Case anyway</button></div>}
        <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setStep('choice')}>Back</button><button className="button button-primary" type="button" disabled={loading} onClick={proceedWithNewCase}>{loading ? 'Checking...' : 'Continue to Ticket'}</button></div>
      </div>}

      {step === 'existing-case' && <div className="flow-section">
        <form className="search-row" onSubmit={(event) => { event.preventDefault(); searchCases() }}><label className="field"><span>Search company</span><input value={caseSearch} onChange={(event) => setCaseSearch(event.target.value)} placeholder="Company name"/></label><button className="button button-secondary" disabled={loading}>{loading ? 'Searching...' : 'Search'}</button></form>
        <div className="case-choice-list">{caseMatches.map((item) => <button key={item.id} type="button" onClick={() => chooseExisting(item)}><strong>{item.companyName}</strong><span>{item.ticketCount} Ticket(s)</span></button>)}{!caseMatches.length && !loading && <div className="compact-empty">Search for a company to select its Case.</div>}</div>
        <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setStep('choice')}>Back</button></div>
      </div>}

      {step === 'ticket' && <form onSubmit={submit} noValidate>
        <div className="selected-case"><span>Selected Case</span><strong>{selectedCase?.companyName ?? companyName}</strong>{!fixedCase && <button type="button" className="text-button" onClick={() => setStep(selectedCase?.id ? 'existing-case' : 'new-case')}>Change</button>}</div>
        <div className="form-grid">
          <label className="field field-wide"><span>Project title</span><input value={ticket.projectTitle} onChange={(event) => setTicket({ ...ticket, projectTitle: event.target.value })} aria-describedby="project-error"/><FieldError id="project-error">{errors.projectTitle}</FieldError></label>
          <label className="field"><span>Current department</span><select value={ticket.currentDepartment} disabled={!maySelectDepartment && Boolean(defaultDepartment)} onChange={(event) => setTicket({ ...ticket, currentDepartment: event.target.value, responsibleManagerId: '' })}><option value="">Select department</option>{reference.departments.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select><FieldError>{errors.currentDepartment}</FieldError>{!maySelectDepartment && defaultDepartment && <small>Set automatically from your business role.</small>}</label>
          <label className="field"><span>Stage</span><select value={ticket.stage} onChange={(event) => setTicket({ ...ticket, stage: event.target.value })}><option value="">Select stage</option>{reference.stages.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select><FieldError>{errors.stage}</FieldError><small>{reference.stages.find((item) => item.slug === ticket.stage)?.description}</small></label>
          <label className="field field-wide"><span>Responsible manager</span><select value={ticket.responsibleManagerId} onChange={(event) => setTicket({ ...ticket, responsibleManagerId: event.target.value })}><option value="">Select {ticket.currentDepartment === 'sales' ? 'Sales Manager' : ticket.currentDepartment === 'delivery' ? 'Delivery Manager' : 'Sales or Delivery Manager'}</option>{eligibleManagers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><FieldError>{errors.responsibleManagerId}</FieldError><small>Only an active Sales Manager or Delivery Manager can own and review this Ticket.</small></label>
          {mayAssignPeople && <fieldset className="field field-wide assignee-picker"><legend>Assigned people</legend><small>Select any number of people. Assigning one person does not replace the others.</small><div className="assignee-options">{reference.assignees.map((item) => <label key={item.id} className="assignee-option"><input type="checkbox" checked={ticket.assigneeIds.includes(item.id)} onChange={() => toggleAssignee(item.id)}/><span>{item.name}</span></label>)}{!reference.assignees.length && <span className="compact-empty">No active assignees are available.</span>}</div></fieldset>}
        </div>
        <div className="contact-form-heading"><div><h3>Company contacts</h3><p>Add at least one named contact with an email address or phone number.</p></div><button className="button button-secondary button-small" type="button" onClick={() => setTicket({ ...ticket, contacts: [...ticket.contacts, emptyContact()] })}><Icon name="plus" size={16}/>Add contact</button></div>
        <div className="contact-form-list">{ticket.contacts.map((contact, index) => { const rowErrors = errors.contactRows?.[index] ?? {}; return <fieldset key={index} className="contact-form-row"><legend>Contact {index + 1}</legend><label className="field"><span>Name</span><input value={contact.name} onChange={(event) => updateContact(index, 'name', event.target.value)}/><FieldError>{rowErrors.name}</FieldError></label><label className="field"><span>Email address</span><input type="email" value={contact.email} onChange={(event) => updateContact(index, 'email', event.target.value)}/><FieldError>{rowErrors.email}</FieldError></label><label className="field"><span>Phone number</span><input type="tel" value={contact.phoneNumber} onChange={(event) => updateContact(index, 'phoneNumber', event.target.value)} placeholder="+94..."/><FieldError>{rowErrors.phoneNumber || rowErrors.method || rowErrors.duplicate}</FieldError></label><button type="button" className="icon-button contact-remove" aria-label={`Remove contact ${index + 1}`} disabled={ticket.contacts.length === 1} onClick={() => setTicket({ ...ticket, contacts: ticket.contacts.filter((_, contactIndex) => contactIndex !== index) })}><Icon name="close"/></button></fieldset> })}</div>
        <FieldError>{errors.contacts}</FieldError>
        <div className="modal-actions"><button className="button button-secondary" type="button" onClick={fixedCase ? onClose : () => setStep(selectedCase?.id ? 'existing-case' : 'new-case')} disabled={loading}>Back</button><button className="button button-primary" disabled={loading}>{loading ? 'Creating Ticket...' : 'Create Ticket'}</button></div>
      </form>}
    </ModalShell>
  )
}
