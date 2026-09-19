import { useCallback, useEffect, useRef, useState } from 'react'
import { assistantService } from '../services/assistantService.js'
import { FollowUpEmail } from './FollowUpEmail.jsx'
import { Icon } from './Icons.jsx'
import { ModalShell } from './ModalShell.jsx'

const unavailable = 'AI Assistant is temporarily unavailable. You can continue using all CRM features.'
const prompts = {
  summary: 'Summarize this ticket.',
  email: 'Draft a polite customer follow-up email for this ticket.',
}

export function AssistantPanel({ ticket, onClose, onSource }) {
  const [availability, setAvailability] = useState(null)
  const [statusError, setStatusError] = useState('')
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState(null)
  const [failed, setFailed] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const request = useRef(null)
  const statusRequest = useRef(null)
  const endRef = useRef(null)

  const checkStatus = useCallback(async () => {
    statusRequest.current?.abort()
    const controller = new AbortController()
    statusRequest.current = controller
    setAvailability(null); setStatusError('')
    try {
      const result = await assistantService.status(AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]))
      if (!controller.signal.aborted) setAvailability(result.available === true)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setAvailability(false)
        setStatusError(failure.name === 'TimeoutError' || failure instanceof TypeError ? unavailable : failure.message || unavailable)
      }
    }
  }, [])

  useEffect(() => {
    checkStatus()
    return () => { statusRequest.current?.abort(); request.current?.abort() }
  }, [checkStatus])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages, pending, error])

  const ask = async (mode, message = prompts[mode], history = messages) => {
    if (request.current || !availability) return
    const controller = new AbortController()
    request.current = controller
    const input = { mode, message, history: history.slice(-8).map((entry) => ({ role: entry.role, content: entry.content })) }
    setPending({ mode, message }); setError(''); setFailed(null); setCopied('')
    try {
      const result = await assistantService.ask(ticket.id, input, AbortSignal.any([controller.signal, AbortSignal.timeout(70000)]))
      if (controller.signal.aborted) return
      if (typeof result.answer !== 'string' || !Array.isArray(result.sources)) throw new Error(unavailable)
      setMessages((current) => [...current, { role: 'user', content: message }, { role: 'assistant', content: result.answer, result }])
      setQuestion('')
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure.name === 'TimeoutError' || failure instanceof TypeError ? unavailable : failure.message || unavailable)
        setFailed({ mode, message, history })
      }
    } finally {
      if (request.current === controller) { request.current = null; setPending(null) }
    }
  }
  const cancel = () => { request.current?.abort(); request.current = null; setPending(null) }
  const copy = async (content, id) => {
    try { await navigator.clipboard.writeText(content); setCopied(id) }
    catch { setCopied('Copy unavailable. Select and copy the text manually.') }
  }

  return <div className="assistant-shell"><ModalShell title="AI Assistant" kicker={ticket.companyName} onClose={onClose}>
    <div className="assistant-ticket"><Icon name="file" size={18}/><div><strong>{ticket.projectTitle}</strong><small>Ticket {ticket.id.slice(0, 8)} · Read-only assistance</small></div></div>
    <p className="assistant-intro">Get a quick summary, ask about this ticket, or draft a follow-up email. Review AI suggestions before using them.</p>
    {availability === null && <p role="status">Checking assistant availability…</p>}
    {availability === false && <div className="assistant-unavailable" role="status"><strong>{statusError || 'AI Assistant is not enabled yet.'}</strong><p>Your tickets, notes, contacts, and follow-ups remain available.</p><button type="button" className="button button-secondary button-small" onClick={checkStatus}>Retry</button></div>}
    <div className="assistant-quick-actions">
      <button type="button" className="button button-secondary button-small" disabled={!availability || Boolean(pending)} onClick={() => ask('summary')}><Icon name="file" size={15}/>Summarize ticket</button>
      <button type="button" className="button button-secondary button-small" disabled={!availability || Boolean(pending)} onClick={() => ask('chat', 'What should I discuss during the next follow-up?')}>Prepare next follow-up</button>
      <button type="button" className="button button-secondary button-small" disabled={!availability || Boolean(pending)} onClick={() => ask('email')}><Icon name="mail" size={15}/>Draft email</button>
    </div>
    <div className="assistant-conversation" role="log" aria-label="Ticket assistant conversation" aria-live="polite" aria-relevant="additions">
      {!messages.length && !pending && <div className="assistant-empty"><Icon name="message" size={28}/><h3>A little context goes a long way.</h3><p>Try “What is the current status?” or “What information is missing?”</p></div>}
      {messages.map((entry, index) => <article key={index} className={`assistant-message ${entry.role}`}>
        <header><strong>{entry.role === 'user' ? 'You' : 'LeadSphere AI'}</strong>{entry.result && <time dateTime={entry.result.generatedAt}>{new Date(entry.result.generatedAt).toLocaleString()}</time>}</header>
        <p className="assistant-answer">{entry.content}</p>
        {entry.result && <>
          <div className="assistant-answer-actions"><span>AI-generated · Verify against the records</span><button type="button" className="text-button" onClick={() => copy(entry.content, String(index))}>{copied === String(index) ? 'Copied' : 'Copy'}</button></div>
          {entry.result.sources.length > 0 && <details className="assistant-sources"><summary>Supporting records ({entry.result.sources.length})</summary>{entry.result.sources.map((source) => <div key={source.id}><button type="button" className="inline-link" onClick={() => onSource(source)}>[{source.id}] {source.label}</button><p>{source.excerpt}</p></div>)}</details>}
          <details className="assistant-scope"><summary>{entry.result.contextLimited ? 'Based on a limited selection of records' : 'Context used'}</summary><p>{entry.result.scope}</p><p>Retrieved {new Date(entry.result.contextAsOf).toLocaleString()}. Ask again to refresh.</p></details>
          {entry.result.email && <FollowUpEmail item={{ ticketId: ticket.id, ticketTitle: ticket.projectTitle }} ticket={ticket} initialDraft={entry.result.email} busy={false}/>}
        </>}
      </article>)}
      {pending && <div className="assistant-message assistant" role="status"><strong>{pending.message}</strong><p>Reading this ticket and preparing a response…</p><button type="button" className="text-button" onClick={cancel}>Stop</button></div>}
      <div ref={endRef}/>
    </div>
    {error && <div className="alert alert-error" role="alert">{error}{failed && <button type="button" className="text-button" onClick={() => ask(failed.mode, failed.message, failed.history)}>Retry</button>}</div>}
    {copied.startsWith('Copy unavailable') && <p role="status">{copied}</p>}
    <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); if (question.trim()) ask('chat', question.trim()) }}>
      <label className="field"><span>Ask about this ticket</span><textarea rows="3" maxLength="2000" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!availability || Boolean(pending)} placeholder="What should I focus on next?"/></label>
      <div><small>{question.length}/2000</small><button type="submit" className="button button-primary button-small" disabled={!availability || Boolean(pending) || !question.trim()}><Icon name="send" size={14}/>Ask assistant</button></div>
    </form>
    <footer className="assistant-footer"><p>Requests share selected ticket records with the AI provider. Chat lasts until you close this panel; only the latest eight messages are used for context.</p>{messages.length > 0 && <button type="button" className="text-button" disabled={Boolean(pending)} onClick={() => { setMessages([]); setError(''); setFailed(null); setCopied('') }}>Clear chat</button>}</footer>
  </ModalShell></div>
}
