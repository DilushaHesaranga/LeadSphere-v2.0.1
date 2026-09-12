export function createFollowUpEmail(item, ticket = null) {
  const title = ticket?.projectTitle || ticket?.title || item.ticketTitle || 'your enquiry'
  return {
    to: '',
    subject: `Following up: ${title}`,
    body: `Hello,\n\nI’m following up on ${title}.${item.purpose?.trim() ? `\n\n${item.purpose.trim()}` : ''}\n\nPlease let me know if you have any updates or questions, and a convenient time to discuss the next steps.\n\nBest regards`,
  }
}

export function gmailComposeUrl({ to, subject, body }) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to: to.trim(), su: subject, body })
  return `https://mail.google.com/mail/?${params.toString()}`
}
