import { supabase } from '../utils/supabase.js'

function reportMessage(error) {
  const message = error?.message ?? 'The report could not be loaded.'
  if (/permission|forbidden|access denied/i.test(message)) return 'Your role does not permit access to Reports & Insights.'
  const expected = [
    'Select a valid report', 'Select a valid pipeline', 'Select a valid stage',
    'Select a valid owner', 'Report date ranges', 'Report end date',
  ]
  return expected.some((prefix) => message.startsWith(prefix)) ? message : 'The report could not be loaded. Please try again.'
}

async function rpc(name, parameters = {}) {
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) throw new Error(reportMessage(error))
  return data
}

function reportParameters(filters = {}) {
  return {
    p_from: filters.from,
    p_to: filters.to,
    p_pipeline_id: filters.pipelineId || null,
    p_stage: filters.stage || null,
    p_owner_id: filters.ownerId || null,
  }
}

export const reportService = Object.freeze({
  getFilterOptions: () => rpc('get_crm_report_filter_options'),
  getOverview: (filters) => rpc('get_crm_reports_overview', reportParameters(filters)),
  listRecords: ({ reportKey, filters, sort = 'recent', direction = 'desc', page = 1, pageSize = 25 }) => rpc('list_crm_report_records', {
    p_report_key: reportKey,
    ...reportParameters(filters),
    p_sort: sort,
    p_direction: direction,
    p_page: page,
    p_page_size: pageSize,
  }),
})
