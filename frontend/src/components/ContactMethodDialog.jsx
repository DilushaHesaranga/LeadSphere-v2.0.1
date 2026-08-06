import { useState } from 'react'
import { contactMethods } from '../config/crm.js'
import { ModalShell } from './ModalShell.jsx'

export function ContactMethodDialog({ contacts, type, onClose, onSelect }) {
  const methods = contactMethods(contacts, type)
  const isEmail = type === 'email'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = async (method) => {
    setBusy(true); setError('')
    try {
      if (onSelect) await onSelect(method)
      else window.location.href = `${isEmail ? 'mailto' : 'tel'}:${method.value}`
      onClose()
    } catch (openError) { setError(openError.message) }
    finally { setBusy(false) }
  }
  return (
    <ModalShell title={`Choose ${isEmail ? 'an email address' : 'a phone number'}`} kicker={isEmail ? 'Email' : 'Call'} onClose={onClose}>
      <p>Select the company contact you want to reach.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="contact-choice-list">
        {methods.map((method) => (
          <button key={`${method.id}-${method.value}`} className="contact-choice" type="button" disabled={busy} onClick={() => open(method)}>
            <strong>{method.name}</strong><span>{method.value}</span>
          </button>
        ))}
      </div>
    </ModalShell>
  )
}
