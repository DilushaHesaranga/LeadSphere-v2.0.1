import { supabase } from '../utils/supabase.js'

function messageFor(error) {
  const message = error?.message ?? 'Timeline data could not be loaded.'
  if (/permission|access denied/i.test(message)) return 'You do not have access to this Timeline data.'
  if (/date range|730 days/i.test(message)) return 'Select a valid date range of no more than two years.'
  return message
}

async function rpc(name, parameters = {}) {
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) throw new Error(messageFor(error))
  return data
}

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function parameters(filters) {
  return {
    p_from: filters.from,
    p_to: filters.to,
    p_grouping: filters.grouping,
    p_categories: filters.categories,
    p_ticket_id: filters.ticketId || null,
    p_department: filters.department || null,
    p_manager_id: filters.managerId || null,
    p_status: filters.status || null,
    p_stage: filters.stage || null,
    p_activity_type: filters.activityType || null,
  }
}

export const timelineService = Object.freeze({
  summary: (filters) => rpc('get_crm_timeline', parameters(filters)),
  details: (filters, selection, page = 1, pageSize = 25) => rpc('list_crm_timeline_details', {
    ...parameters(filters),
    p_bucket_start: selection.date,
    p_category: selection.category,
    p_page: page,
    p_page_size: pageSize,
  }),
  filterOptions: () => rpc('get_crm_timeline_filter_options'),
  searchTickets: (search = '') => rpc('search_crm_timeline_tickets', { p_search: search, p_limit: 30 }),
  recordCommunicationLaunch: (ticketId, category, contact) => rpc('record_crm_communication_launch', {
    p_ticket_id: ticketId,
    p_category: category,
    p_contact_id: contact.id,
    p_recipient: contact.value,
    p_client_request_id: requestId(),
  }),
})
