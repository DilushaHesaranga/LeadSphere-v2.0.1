import { supabase } from '../utils/supabase.js'

function pipelineMessage(error) {
  const message = error?.message ?? 'The pipeline request could not be completed.'
  const known = message.match(/PIPELINE_[A-Z_]+:\s*(.+)$/)
  if (known) return known[1]
  if (/permission|forbidden|access denied/i.test(message)) return 'Your role does not permit this pipeline action.'
  return message
}

async function rpc(name, parameters = {}) {
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) throw new Error(pipelineMessage(error))
  return data
}

export const pipelineService = Object.freeze({
  listPipelines: () => rpc('list_crm_pipelines'),
  loadBoard: ({ pipelineId = null, search = '', ownerId = '', category = '', stageAgeDays = '', sort = 'recent', page = 1, pageSize = 25 } = {}) => rpc('get_crm_pipeline_board', {
    p_pipeline_id: pipelineId || null,
    p_search: search,
    p_owner_id: ownerId || null,
    p_category: category || null,
    p_stage_age_days: stageAgeDays === '' ? null : Number(stageAgeDays),
    p_sort: sort,
    p_page: page,
    p_page_size: pageSize,
  }),
  moveTicket: ({ ticketId, pipelineId, stage, expectedVersion, source = 'BOARD', idempotencyKey }) => rpc('move_crm_ticket_stage', {
    p_ticket_id: ticketId,
    p_pipeline_id: pipelineId,
    p_stage_slug: stage,
    p_expected_version: expectedVersion,
    p_source: source,
    p_idempotency_key: idempotencyKey,
  }),
  getStageHistory: (ticketId) => rpc('get_crm_ticket_stage_history', { p_ticket_id: ticketId }),
})
