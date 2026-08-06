import { useEffect, useRef, useState } from 'react'
import { createFollowUpRequestId, FOLLOW_UP_FREQUENCIES, FOLLOW_UP_TYPES, localDateTimeToIso, toDateTimeLocalValue, validateFollowUp } from '../config/followUps.js'
import { followUpService } from '../services/followUpService.js'
import { Icon } from './Icons.jsx'
import { ModalShell } from './ModalShell.jsx'

function FieldError({ children }) {
  return children ? <small className="field-error">{children}</small> : null
}

export function FollowUpDialog({ ticket = null, followUp = null, onClose, onSaved }) {
  const editing = Boolean(followUp)
  const [step, setStep] = useState(ticket || editing ? 'details' : 'ticket')
  const [selectedTicket, setSelectedTicket] = useState(ticket ?? (followUp ? { id: followUp.ticketId, title: followUp.ticketTitle, companyName: followUp.companyName, number: followUp.ticketNumber } : null))
  const [search, setSearch] = useState('')
  const [tickets, setTickets] = useState([])
  const [searching, setSearching] = useState(false)
  const [form, setForm] = useState({
    scheduledAt: toDateTimeLocalValue(followUp?.scheduledAt),
    type: followUp?.type ?? '',
    purpose: followUp?.purpose ?? '',
    recurring: followUp?.recurring ?? false,
    frequency: followUp?.frequency ?? '',
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestId = useRef(createFollowUpRequestId())

  useEffect(() => {
    if (step !== 'ticket') return undefined
    let active = true
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const result = await followUpService.searchTickets(search)
        if (active) { setTickets(result); setError('') }
      } catch (loadError) { if (active) setError(loadError.message) }
      finally { if (active) setSearching(false) }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [search, step])

  const changeRecurring = (checked) => setForm((current) => ({ ...current, recurring: checked, frequency: checked ? current.frequency : '' }))
  const submit = async (event) => {
    event.preventDefault()
    const input = { ...form, ticketId: selectedTicket?.id ?? '', scheduledAt: localDateTimeToIso(form.scheduledAt) }
    const validation = validateFollowUp(input, { requireTicket: true })
    setErrors(validation); setError('')
    if (Object.keys(validation).length) return
    setBusy(true)
    try {
      const result = editing
        ? await followUpService.update(followUp.id, input)
        : await followUpService.create({ ...input, clientRequestId: requestId.current })
      onSaved(result, selectedTicket, editing)
    } catch (saveError) { setError(saveError.message) }
    finally { setBusy(false) }
  }

  return <ModalShell title={editing ? 'Edit Follow Up' : 'Create Follow Up'} kicker={step === 'ticket' ? 'Step 1 of 2 · Select Ticket' : ticket ? `Ticket ${ticket.id.slice(0, 8)}` : 'Step 2 of 2 · Follow-Up details'} onClose={onClose} wide>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {step === 'ticket' ? <div className="follow-up-ticket-step">
      <label className="field"><span>Search Tickets</span><div className="follow-up-search"><Icon name="search" size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ticket number, title, or company" autoFocus/></div><FieldError>{errors.ticketId}</FieldError></label>
      {searching ? <div className="loading-state follow-up-ticket-loading">Searching Tickets...</div> : <div className="follow-up-ticket-results">{tickets.map((item) => <button type="button" key={item.id} onClick={() => { setSelectedTicket(item); setErrors({}); setStep('details') }}><span className="follow-up-type-icon"><Icon name="file" size={17}/></span><span><strong>{item.title}</strong><small>{item.companyName} · Ticket {item.number}</small></span><Icon name="arrow" size={17}/></button>)}{!tickets.length && <div className="compact-empty">No authorised active Tickets match this search.</div>}</div>}
    </div> : <form onSubmit={submit} noValidate>
      <div className="selected-case follow-up-selected-ticket"><span>Selected Ticket</span><strong>{selectedTicket?.title ?? selectedTicket?.projectTitle}</strong><small>{selectedTicket?.companyName} · Ticket {selectedTicket?.number ?? selectedTicket?.id?.slice(0, 8)}</small>{!ticket && !editing && <button type="button" className="text-button" onClick={() => setStep('ticket')}>Change</button>}</div>
      <div className="form-grid follow-up-form-grid">
        <label className="field"><span>Follow-up date and time</span><input type="datetime-local" min={toDateTimeLocalValue(new Date())} value={form.scheduledAt} onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })}/><FieldError>{errors.scheduledAt}</FieldError></label>
        <label className="field"><span>Follow-up type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="">Select type</option>{FOLLOW_UP_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><FieldError>{errors.type}</FieldError></label>
        <label className="field field-wide"><span>Purpose <small>(optional)</small></span><textarea rows="4" maxLength="1000" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} placeholder="What should be achieved during this follow-up?"/><small>{form.purpose.length}/1000</small><FieldError>{errors.purpose}</FieldError></label>
        <label className="follow-up-switch field-wide"><input type="checkbox" checked={form.recurring} disabled={editing} onChange={(event) => changeRecurring(event.target.checked)}/><span><strong>Recurring Follow Up</strong><small>{editing ? 'Recurrence cannot be converted after creation.' : 'Create the next occurrence only after this one is completed.'}</small></span></label>
        {form.recurring && <label className="field field-wide"><span>Recurrence frequency</span><select value={form.frequency} required onChange={(event) => setForm({ ...form, frequency: event.target.value })}><option value="">Select frequency</option>{FOLLOW_UP_FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><FieldError>{errors.frequency}</FieldError></label>}
      </div>
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Create Follow Up'}</button></div>
    </form>}
  </ModalShell>
}
