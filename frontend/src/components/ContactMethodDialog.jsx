import { contactMethods } from '../config/crm.js'
import { ModalShell } from './ModalShell.jsx'

export function ContactMethodDialog({ contacts, type, onClose }) {
  const methods = contactMethods(contacts, type)
  const isEmail = type === 'email'
  const open = (value) => {
    window.location.href = `${isEmail ? 'mailto' : 'tel'}:${value}`
    onClose()
  }
  return (
    <ModalShell title={`Choose ${isEmail ? 'an email address' : 'a phone number'}`} kicker={isEmail ? 'Email' : 'Call'} onClose={onClose}>
      <p>Select the company contact you want to reach.</p>
      <div className="contact-choice-list">
        {methods.map((method) => (
          <button key={`${method.id}-${method.value}`} className="contact-choice" type="button" onClick={() => open(method.value)}>
            <strong>{method.name}</strong><span>{method.value}</span>
          </button>
        ))}
      </div>
    </ModalShell>
  )
}
