import test from 'node:test'
import assert from 'node:assert/strict'
import { createFollowUpEmail, gmailComposeUrl } from '../src/config/followUpEmail.js'

test('email template includes ticket context and purpose', () => {
  const draft = createFollowUpEmail({ ticketTitle: 'Website', purpose: 'Please review the proposal.' })
  assert.equal(draft.subject, 'Following up: Website')
  assert.ok(draft.body.includes('Please review the proposal.'))
  assert.equal(draft.to, '')
  assert.equal(createFollowUpEmail({}, { projectTitle: 'New project' }).subject, 'Following up: New project')
})

test('email template handles missing context without undefined placeholders', () => {
  const draft = createFollowUpEmail({})
  assert.ok(draft.body.includes('your enquiry'))
  assert.ok(!draft.body.includes('undefined'))
})

test('Gmail compose preserves Unicode, newlines and special characters without adding parameters', () => {
  const draft = { to: ' sales+team@example.com ', subject: 'Proposal & pricing #2', body: 'Hello,\n\nRésumé? &bcc=other@example.com' }
  const url = new URL(gmailComposeUrl(draft))
  assert.equal(url.origin, 'https://mail.google.com')
  assert.equal(url.searchParams.get('view'), 'cm')
  assert.equal(url.searchParams.get('to'), draft.to.trim())
  assert.equal(url.searchParams.get('su'), draft.subject)
  assert.equal(url.searchParams.get('body'), draft.body)
  assert.equal(url.searchParams.has('bcc'), false)
})
