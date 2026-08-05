export const DEPARTMENTS = Object.freeze([
  { slug: 'marketing', name: 'Marketing' },
  { slug: 'sales', name: 'Sales' },
  { slug: 'delivery', name: 'Delivery' },
])

export const TICKET_STAGES = Object.freeze([
  { slug: 'qualification', name: 'Qualification', businessArea: 'leads', description: 'Select the most viable deals and engage them.' },
  { slug: 'proposal_or_price_quote', name: 'Proposal or Price Quote', businessArea: 'leads', description: 'Discuss the proposal and budget, then sign off on compliance, IT, or onboarding requirements.' },
  { slug: 'negotiation', name: 'Negotiation', businessArea: 'leads', description: 'Revisit the quote, decide the final price, and sign the contract.' },
  { slug: 'sales_order', name: 'Sales Order', businessArea: 'customers', description: 'Create the sales order and finalize the dispatch details. The lead becomes a customer at this stage.' },
  { slug: 'payment', name: 'Payment', businessArea: 'customers', description: 'Deliver the order and receive payment.' },
  { slug: 'close_won', name: 'Close won', businessArea: 'customers', description: 'The deal is won and the customer details are saved for future business.' },
  { slug: 'lost', name: 'Lost', businessArea: 'customers', description: 'The deal is lost and the customer may or may not be contacted for future business.' },
])

export const REQUEST_TYPES = Object.freeze({
  ASSIGN_TO_ME: 'ASSIGN_TO_ME',
  POST_TICKET: 'POST_TICKET',
  DELETE_TICKET: 'DELETE_TICKET',
  DELETE_CASE: 'DELETE_CASE',
})

export const REQUEST_STATUSES = Object.freeze(['PENDING', 'APPROVED', 'REJECTED', 'MODIFIED'])

const MANAGER_ROLES = new Set([
  'marketing_manager',
  'sales_manager',
  'delivery_manager',
  'leadership',
  'system_admin',
])

export function ticketBusinessArea(stage) {
  return TICKET_STAGES.find((item) => item.slug === stage)?.businessArea ?? 'customers'
}

export function ticketStage(stage) {
  return TICKET_STAGES.find((item) => item.slug === stage) ?? null
}

export function getDefaultDepartment(roles = []) {
  const slugs = new Set(roles.map((role) => typeof role === 'string' ? role : role.slug))
  if (slugs.has('marketing_executive') && ![...slugs].some((role) => MANAGER_ROLES.has(role))) return 'marketing'
  if ((slugs.has('sales_executive') || slugs.has('sales_manager')) && !slugs.has('leadership') && !slugs.has('system_admin')) return 'sales'
  if (slugs.has('delivery_manager') && !slugs.has('leadership') && !slugs.has('system_admin')) return 'delivery'
  return ''
}

export function canSelectInitialDepartment(roles = []) {
  const slugs = roles.map((role) => typeof role === 'string' ? role : role.slug)
  return slugs.some((role) => ['marketing_manager', 'delivery_manager', 'leadership', 'system_admin'].includes(role))
}

export function normalizePhone(phone = '') {
  return phone.trim().replace(/\s+/g, '')
}

export function validateCase(companyName) {
  return companyName?.trim().length >= 2 ? {} : { companyName: 'Company name is required.' }
}

export function validateContact(contact = {}) {
  const errors = {}
  const name = contact.name?.trim() ?? ''
  const email = contact.email?.trim() ?? ''
  const phone = normalizePhone(contact.phoneNumber ?? '')
  if (name.length < 2) errors.name = 'Contact name is required.'
  if (!email && !phone) errors.method = 'Add an email address or phone number.'
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'
  if (phone && !/^\+?[0-9()-]{7,30}$/.test(phone)) errors.phoneNumber = 'Enter a valid phone number.'
  return errors
}

function duplicateContactIndexes(contacts) {
  const seen = new Map()
  const duplicates = new Set()
  contacts.forEach((contact, index) => {
    const key = [contact.name, contact.email, normalizePhone(contact.phoneNumber)]
      .map((value) => value?.trim().toLowerCase() ?? '')
      .join('|')
    if (seen.has(key)) {
      duplicates.add(seen.get(key))
      duplicates.add(index)
    } else seen.set(key, index)
  })
  return duplicates
}

export function validateTicket(ticket = {}) {
  const errors = {}
  if (!ticket.caseId) errors.caseId = 'Select a Case.'
  if ((ticket.projectTitle?.trim() ?? '').length < 2) errors.projectTitle = 'Project title is required.'
  if (!ticket.currentDepartment) errors.currentDepartment = 'Current department is required.'
  if (!ticket.stage) errors.stage = 'Stage is required.'
  if (!ticket.responsibleManagerId) errors.responsibleManagerId = 'Responsible manager is required.'
  if (!ticket.contacts?.length) errors.contacts = 'At least one contact is required.'
  const contactErrors = (ticket.contacts ?? []).map(validateContact)
  duplicateContactIndexes(ticket.contacts ?? []).forEach((index) => {
    contactErrors[index] = { ...contactErrors[index], duplicate: 'This contact is duplicated.' }
  })
  if (contactErrors.some((error) => Object.keys(error).length)) errors.contactRows = contactErrors
  return errors
}

export function prepareContacts(contacts = []) {
  return contacts.map((contact) => ({
    name: contact.name.trim(),
    email: contact.email.trim().toLowerCase(),
    phoneNumber: normalizePhone(contact.phoneNumber),
  }))
}

export function contactMethods(contacts = [], type) {
  const key = type === 'email' ? 'email' : 'phoneNumber'
  return contacts
    .filter((contact) => contact[key])
    .map((contact) => ({ id: contact.id, name: contact.name, value: contact[key] }))
}

export function shouldShowContactPicker(contacts, type) {
  return contactMethods(contacts, type).length > 1
}

export function requestLabel(type) {
  return ({
    [REQUEST_TYPES.ASSIGN_TO_ME]: 'Assign to Me',
    [REQUEST_TYPES.POST_TICKET]: 'Post Ticket',
    [REQUEST_TYPES.DELETE_TICKET]: 'Delete Ticket',
    [REQUEST_TYPES.DELETE_CASE]: 'Delete Case',
  })[type] ?? 'Permission Request'
}

export function humanizeActivity(action = '') {
  return action.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

export function formatDateTime(value) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not available'
}
