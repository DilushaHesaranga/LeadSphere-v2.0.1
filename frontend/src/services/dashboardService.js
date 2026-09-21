import { dashboardErrorMessage, dashboardParameters } from '../config/dashboard.js'
import { supabase } from '../utils/supabase.js'

async function rpc(name, parameters) {
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) throw new Error(dashboardErrorMessage(error))
  if (!data) throw new Error('The dashboard returned no data. Please try again.')
  return data
}

export const dashboardService = Object.freeze({
  getPersonal: () => rpc('get_crm_personal_dashboard', {}),
  prepareCall: (ticketId, contactId) => rpc('prepare_crm_personal_call', {
    p_ticket_id: ticketId, p_contact_id: contactId, p_request_id: crypto.randomUUID(),
  }),
  getFilterOptions: () => rpc('get_crm_dashboard_filter_options', {}),
  getOverview: (filters) => rpc('get_crm_dashboard', dashboardParameters(filters)),
  listRecords: (filters, { kind = 'all', stage = '', page = 1 } = {}) => rpc('get_crm_dashboard_records', {
    ...dashboardParameters(filters), p_kind: kind, p_stage: stage || null, p_page: page, p_page_size: 10,
  }),
})
