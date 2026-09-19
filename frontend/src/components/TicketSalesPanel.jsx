import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { DEFAULT_SALES_CURRENCY, formatDealValue, SALES_CURRENCIES, validateDealValue } from '../config/ticketSales.js'
import { ticketSalesService } from '../services/ticketSalesService.js'
import './TicketSalesPanel.css'

export function TicketSalesPanel({ ticketId, mayUpdate }) {
  const id = useId()
  const requestVersion = useRef(0)
  const saving = useRef(false)
  const editButton = useRef(null)
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(DEFAULT_SALES_CURRENCY)
  const [error, setError] = useState('')
  const [validation, setValidation] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true); setError(''); setSuccess(''); setRecord(null); setEditing(false)
    setValidation(''); setBusy(false); saving.current = false
    try {
      const result = await ticketSalesService.get(ticketId)
      if (requestVersion.current === version) setRecord(result)
    } catch (failure) {
      if (requestVersion.current === version) setError(failure.message)
    } finally {
      if (requestVersion.current === version) setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    load()
    return () => { requestVersion.current += 1 }
  }, [load])

  const openEditor = () => {
    setAmount(record.dealValue == null ? '' : String(record.dealValue))
    setCurrency(record.currency); setError(''); setValidation(''); setSuccess(''); setEditing(true)
  }
  const closeEditor = () => {
    setEditing(false); setError(''); setValidation('')
    window.requestAnimationFrame(() => editButton.current?.focus())
  }
  const save = async (event) => {
    event.preventDefault()
    if (saving.current || !mayUpdate) return
    const parsed = validateDealValue(amount)
    if (parsed.error) { setValidation(parsed.error); return }
    const version = ++requestVersion.current
    saving.current = true
    setBusy(true); setError(''); setValidation(''); setSuccess('')
    try {
      const result = await ticketSalesService.update(ticketId, { dealValue: parsed.value, currency })
      if (requestVersion.current !== version) return
      setRecord(result); setEditing(false); setSuccess(result.dealValue == null ? 'Recorded deal value cleared.' : 'Recorded deal value saved.')
      window.dispatchEvent(new Event('leadsphere:sales-changed'))
      window.requestAnimationFrame(() => editButton.current?.focus())
    } catch (failure) {
      if (requestVersion.current === version) setError(failure.message)
    } finally {
      if (requestVersion.current === version) { setBusy(false); saving.current = false }
    }
  }

  return <section className="detail-panel ticket-sales-panel" aria-labelledby={`${id}-heading`} aria-busy={loading || busy}>
    <div className="panel-heading ticket-sales-heading"><div><h2 id={`${id}-heading`}>Recorded deal value</h2><p>Won tickets contribute this amount to recorded sales. This is not a payment record.</p></div>
      {record && mayUpdate && !editing && <button type="button" ref={editButton} className="button button-secondary button-small" onClick={openEditor}>{record.dealValue == null ? 'Add value' : 'Edit value'}</button>}
    </div>
    <div className="ticket-sales-body">
      {loading && <p role="status">Loading recorded deal value…</p>}
      {error && <div className="alert alert-error" role="alert">{error}{!record && <button type="button" className="text-button" onClick={load}>Retry</button>}</div>}
      {success && <div className="alert alert-success" role="status">{success}</div>}
      {record && <>
        <div className="ticket-sales-current"><strong>{formatDealValue(record.dealValue, record.currency)}</strong><span>{record.dealValue == null ? 'Add a value when the deal amount is known.' : `Amounts are reported separately in ${record.currency}.`}</span></div>
        {editing && mayUpdate && <form className="ticket-sales-form" onSubmit={save} noValidate>
          <div className="ticket-sales-fields">
            <label className="field" htmlFor={`${id}-amount`}><span>Deal value <small>(optional)</small></span><input id={`${id}-amount`} type="text" inputMode="decimal" autoFocus maxLength={40} placeholder="e.g. 125000.00" value={amount} disabled={busy} aria-invalid={Boolean(validation)} aria-describedby={`${id}-amount-help${validation ? ` ${id}-error` : ''}`} onChange={(event) => { setAmount(event.target.value); setValidation('') }}/><small id={`${id}-amount-help`}>Use up to two decimal places. Leave empty to clear the recorded value.</small>{validation && <span id={`${id}-error`} className="field-error" role="alert">{validation}</span>}</label>
            <label className="field" htmlFor={`${id}-currency`}><span>Currency</span><select id={`${id}-currency`} value={currency} disabled={busy} onChange={(event) => setCurrency(event.target.value)}>{SALES_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
          </div>
          <div className="ticket-sales-actions"><button type="button" className="button button-secondary button-small" disabled={busy} onClick={closeEditor}>Cancel</button><button type="submit" className="button button-primary button-small" disabled={busy}>{busy ? 'Saving…' : 'Save value'}</button></div>
        </form>}
      </>}
    </div>
  </section>
}
