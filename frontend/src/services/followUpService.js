import { supabase } from '../utils/supabase.js'

function messageFor(error) {
  const message = error?.message ?? 'The Follow Up request could not be completed.'
  if (message.includes('Permission denied') || message.includes('access denied')) return 'You do not have permission to manage Follow Ups for this Ticket.'
  if (message.includes('duplicate key')) return 'This Follow Up has already been saved.'
  const safeMessages = [
    'Select a ', 'Purpose must ', 'Only active Tickets ', 'Only pending Follow Ups ',
    'Ticket not found', 'Follow Up not found', 'Recurring Follow Up not found',
    'A request identifier ', 'A one-time follow-up ', 'Authentication required',
  ]
  return safeMessages.some((prefix) => message.startsWith(prefix)) ? message : 'The Follow Up request could not be completed. Please try again.'
}

async function rpc(name, parameters = {}) {
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) throw new Error(messageFor(error))
  return data
}

export const followUpService = Object.freeze({
  list: ({ ticketId = null, status = null, limit = 100, offset = 0 } = {}) => rpc('list_crm_follow_ups', {
    p_ticket_id: ticketId,
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  }),
  searchTickets: (search = '', limit = 30) => rpc('search_crm_follow_up_tickets', { p_search: search, p_limit: limit }),
  create: (input) => rpc('create_crm_follow_up', {
    p_ticket_id: input.ticketId,
    p_scheduled_at: input.scheduledAt,
    p_type: input.type,
    p_purpose: input.purpose || null,
    p_recurring: input.recurring,
    p_frequency: input.recurring ? input.frequency : null,
    p_client_request_id: input.clientRequestId,
  }),
  update: (followUpId, input) => rpc('update_crm_follow_up', {
    p_follow_up_id: followUpId,
    p_scheduled_at: input.scheduledAt,
    p_type: input.type,
    p_purpose: input.purpose || null,
    p_frequency: input.recurring ? input.frequency : null,
  }),
  complete: (followUpId) => rpc('complete_crm_follow_up', { p_follow_up_id: followUpId }),
  cancel: (followUpId) => rpc('cancel_crm_follow_up', { p_follow_up_id: followUpId }),
  stopSeries: (seriesId) => rpc('stop_crm_follow_up_series', { p_series_id: seriesId }),
})
