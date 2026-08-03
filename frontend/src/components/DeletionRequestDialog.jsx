import { useState } from 'react'
import { ModalShell } from './ModalShell.jsx'

export function DeletionRequestDialog({
  kind,
  name,
  companyName,
  ticketCount = 0,
  managers = [],
  responsibleManagerName = '',
  busy = false,
  onClose,
  onSubmit,
}) {
  const [managerId, setManagerId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const isCase = kind === 'case'
  const blocked = isCase && ticketCount > 0

  const submit = (event) => {
    event.preventDefault()
    if (blocked) return
    if (isCase && !managerId) return setError('Select a manager to review this deletion request.')
    onSubmit({ managerId, note })
  }

  return <ModalShell title={isCase ? 'Delete Case' : 'Delete Ticket'} kicker="Manager approval required" onClose={onClose}>
    <form onSubmit={submit} noValidate>
      <div className="confirm-copy">
        <p>Request deletion of <strong>{name}</strong>{companyName ? ` for ${companyName}` : ''}?</p>
        <p>No record will be deleted now. A manager must accept the request before LeadSphere archives it.</p>
      </div>
      {blocked && <div className="alert alert-error" role="alert">This Case contains {ticketCount} Ticket(s). Request deletion of each Ticket first and wait for manager approval.</div>}
      {!isCase && <div className="selected-case"><span>Reviewer</span><strong>{responsibleManagerName}</strong></div>}
      {isCase && !blocked && <label className="field"><span>Reviewing manager</span><select value={managerId} onChange={(event) => { setManagerId(event.target.value); setError('') }}><option value="">Select manager</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select>{error && <small className="field-error">{error}</small>}</label>}
      {!blocked && <label className="field"><span>Reason or context <small>(optional)</small></span><textarea rows="3" maxLength="1000" value={note} onChange={(event) => setNote(event.target.value)} /></label>}
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>{!blocked && <button className="button button-danger" disabled={busy}>{busy ? 'Submitting...' : 'Request deletion'}</button>}</div>
    </form>
  </ModalShell>
}
