import { useEffect, useId, useState } from 'react'
import { createFollowUpEmail, gmailComposeUrl } from '../config/followUpEmail.js'
import { caseTicketService } from '../services/caseTicketService.js'
import { Icon } from './Icons.jsx'

export function FollowUpEmail({ item, ticket, busy }) {
  const [draft, setDraft] = useState(() => createFollowUpEmail(item, ticket))
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const contactListId = useId()

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const details = ticket ?? await caseTicketService.getTicket(item.ticketId)
        if (!active) return
        const emails = (details.contacts ?? []).filter((contact) => contact.email)
        setContacts(emails)
        if (emails.length === 1) setDraft((current) => ({ ...current, to: current.to || emails[0].email }))
      } catch {
        if (active) setError('Contacts could not be loaded. Enter the recipient’s email below.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [item.ticketId, ticket])

  const change = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }))
  const send = (event) => {
    event.preventDefault()
    window.open(gmailComposeUrl(draft), '_blank', 'noopener,noreferrer')
  }

  return <form className="follow-up-email" onSubmit={send} onInvalid={(event) => { event.currentTarget.querySelector('details').open = true }}>
    <details open>
      <summary>Email template</summary>
      {error && <p role="status">{error}</p>}
      <label className="field"><span>To</span><input type="email" required list={contactListId} value={draft.to} onChange={change('to')} placeholder={loading ? 'Loading contacts…' : 'Enter or select an email'}/></label>
      <datalist id={contactListId}>{contacts.map((contact) => <option key={contact.id ?? contact.email} value={contact.email}>{contact.name}</option>)}</datalist>
      <label className="field"><span>Subject</span><input required value={draft.subject} onChange={change('subject')}/></label>
      <label className="field"><span>Message</span><textarea required rows="8" value={draft.body} onChange={change('body')}/></label>
    </details>
    <p>Opens a draft in Gmail for you to review and send.</p>
    <button className="button button-primary button-small" type="submit" disabled={busy || loading}><Icon name="mail" size={14}/>Send email</button>
  </form>
}


