import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  calculateExpectedRevenue, canMovePipelineCard, formatStageAge, formatStageDuration,
  mergePipelineStagePage, parsePipelineFilters, serializePipelineFilters, validateStageProbability,
} from '../src/config/pipeline.js'
import { TICKET_STAGES } from '../src/config/crm.js'

const migration = await readFile(new URL('../../supabase/migrations/20260815000100_ticket_pipeline_board.sql', import.meta.url), 'utf8')
const page = await readFile(new URL('../src/pages/PipelinePage.jsx', import.meta.url), 'utf8')
const detail = await readFile(new URL('../src/pages/TicketDetailPage.jsx', import.meta.url), 'utf8')
const consolePage = await readFile(new URL('../src/pages/ConsolePage.jsx', import.meta.url), 'utf8')
const creation = await readFile(new URL('../src/components/TicketCreationFlow.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/pipelineService.js', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('probability validation accepts supported boundaries and rejects invalid values', () => {
  assert.equal(validateStageProbability(0), true)
  assert.equal(validateStageProbability(100), true)
  assert.equal(validateStageProbability(33.33), true)
  assert.equal(validateStageProbability(-0.01), false)
  assert.equal(validateStageProbability(100.01), false)
  assert.equal(validateStageProbability('not-a-number'), false)
})

test('expected revenue uses decimal cents rather than binary floating point', () => {
  assert.equal(calculateExpectedRevenue('100.10', 45), '45.05')
  assert.equal(calculateExpectedRevenue('999999999999.99', 100), '999999999999.99')
  assert.equal(calculateExpectedRevenue('-1.00', 50), null)
  assert.equal(calculateExpectedRevenue('25.00', 101), null)
})

test('LeadSphere stage semantics and ordering are explicit', () => {
  assert.deepEqual(TICKET_STAGES.map((stage) => stage.slug), [
    'qualification', 'proposal_or_price_quote', 'negotiation', 'sales_order', 'payment', 'close_won', 'lost',
  ])
  assert.equal(TICKET_STAGES.find((stage) => stage.slug === 'close_won').category, 'won')
  assert.equal(TICKET_STAGES.find((stage) => stage.slug === 'lost').category, 'lost')
  assert.equal(TICKET_STAGES.find((stage) => stage.slug === 'sales_order').businessArea, 'customers')
})

test('stage age and history duration handle initial and current stages', () => {
  assert.equal(formatStageAge(0), '0 minutes')
  assert.equal(formatStageAge(60), '1 minute')
  assert.equal(formatStageAge(7200), '2 hours')
  assert.equal(formatStageAge(172800), '2 days')
  assert.equal(formatStageDuration(null), 'Initial stage')
})

test('pipeline filters round-trip through the URL and discard unsupported values', () => {
  const filters = { search: ' North Star ', ownerId: 'user-1', category: 'open', stageAgeDays: '7', sort: 'oldest_stage' }
  const query = serializePipelineFilters(filters, 'pipeline-1')
  assert.match(query, /pipeline=pipeline-1/)
  assert.deepEqual(parsePipelineFilters(query), { search: 'North Star', ownerId: 'user-1', category: 'open', stageAgeDays: '7', sort: 'oldest_stage' })
  assert.deepEqual(parsePipelineFilters('?category=invalid&age=-1&sort=unsafe'), { search: '', ownerId: '', category: '', stageAgeDays: '', sort: 'recent' })
})

test('incremental stage pages merge without duplicate cards', () => {
  const board = { stages: [{ slug: 'qualification', cards: [{ id: '1' }], hasMore: true, loadingMore: true }] }
  const pageResult = { page: 2, stages: [{ slug: 'qualification', cards: [{ id: '1' }, { id: '2' }], hasMore: false }] }
  const merged = mergePipelineStagePage(board, pageResult, 'qualification')
  assert.deepEqual(merged.stages[0].cards.map((card) => card.id), ['1', '2'])
  assert.equal(merged.stages[0].loadedPage, 2)
  assert.equal(merged.stages[0].loadingMore, false)
})

test('client movement decision requires permission, an active Ticket, and a different stage', () => {
  assert.equal(canMovePipelineCard({ status: 'active', stage: 'qualification' }, 'negotiation', true), true)
  assert.equal(canMovePipelineCard({ status: 'active', stage: 'qualification' }, 'qualification', true), false)
  assert.equal(canMovePipelineCard({ status: 'closed', stage: 'qualification' }, 'negotiation', true), false)
  assert.equal(canMovePipelineCard({ status: 'active', stage: 'qualification' }, 'negotiation', false), false)
})

test('migration seeds and backfills a safe default pipeline without duplicating Ticket entities', () => {
  assert.match(migration, /insert into public\.crm_pipelines[\s\S]*'sales', 'Sales Pipeline'/)
  assert.match(migration, /crm_pipelines_one_active_default/)
  assert.match(migration, /update public\.crm_tickets ticket[\s\S]*stage_entered_at = coalesce/)
  assert.match(migration, /where not exists \([\s\S]*crm_ticket_stage_history/)
  assert.doesNotMatch(migration, /create table if not exists public\.(deals|opportunities)/i)
})

test('pipeline and stage integrity are database enforced and historical stages are protected', () => {
  assert.match(migration, /probability between 0 and 100/)
  assert.match(migration, /semantic_category in \('open', 'won', 'lost'\)/)
  assert.match(migration, /crm_ticket_stages_pipeline_order_idx/)
  assert.match(migration, /PIPELINE_STAGE_MISMATCH/)
  assert.match(migration, /references public\.crm_ticket_stages\(slug\) on delete restrict/)
  assert.match(migration, /references public\.crm_pipelines\(id\) on delete restrict/)
})

test('the single transition operation is authorized, atomic, versioned, and idempotent', () => {
  assert.match(migration, /create or replace function public\.move_crm_ticket_stage/)
  assert.match(migration, /for update/)
  assert.match(migration, /deals\.move_stage[\s\S]*leads\.change_status/)
  assert.match(migration, /p_expected_version <> ticket_record\.pipeline_version/)
  assert.match(migration, /crm_ticket_stage_history_idempotency_unique/)
  assert.match(migration, /set_config\('app\.crm_transition_idempotency_key'/)
  assert.match(migration, /after update of pipeline_id, stage[\s\S]*crm_record_ticket_stage_transition/)
  assert.match(migration, /update_crm_ticket[\s\S]*move_crm_ticket_stage/)
})

test('history captures audit fields and stage notifications use the existing delivery path once', () => {
  assert.match(migration, /previous_stage_entered_at[\s\S]*duration_seconds[\s\S]*probability_snapshot[\s\S]*transition_source/)
  assert.match(migration, /changedByName[\s\S]*durationSeconds[\s\S]*source/)
  assert.match(migration, /'STAGE_CHANGED'/)
  assert.match(migration, /on conflict \(user_id, event_key\) do nothing/)
  assert.match(detail, /Stage history[\s\S]*previousStageName[\s\S]*durationSeconds/)
})

test('board queries are scoped, filtered, aggregated, ordered, and incrementally paginated', () => {
  assert.match(migration, /'company'::public\.data_access_scope[\s\S]*permission\.slug = 'pipeline\.read'/)
  assert.match(migration, /public\.crm_can_access_ticket\(ticket\.id, 'pipeline\.read'\)/)
  assert.match(migration, /'canMove',[\s\S]*deals\.move_stage[\s\S]*leads\.change_status/)
  assert.match(migration, /safe_category[\s\S]*p_stage_age_days[\s\S]*p_owner_id[\s\S]*safe_search/)
  assert.match(migration, /'totalCount', \(select count\(\*\) from filtered\)/)
  assert.match(migration, /order by stage\.sort_order/)
  assert.match(migration, /offset \(safe_page - 1\) \* safe_size[\s\S]*limit safe_size/)
  assert.match(migration, /row_number\(\) over \(order by/)
})

test('board UI includes all required states and both pointer and keyboard movement', () => {
  assert.match(consolePage, /pathname === '\/console\/pipeline'.*<PipelinePage/)
  assert.match(page, /Loading pipeline/)
  assert.match(page, /No active pipeline is configured/)
  assert.match(page, /No Tickets match these filters/)
  assert.match(page, /onDragStart[\s\S]*onDrop/)
  assert.match(page, /aria-label=\{`Move \$\{card\.projectTitle\} to another stage`\}/)
  assert.match(page, /Load more/)
  assert.match(page, /Owner or assignee[\s\S]*Stage category[\s\S]*Minimum stage age[\s\S]*Sort cards/)
  assert.match(page, /requestSequence/)
  assert.match(service, /move_crm_ticket_stage/)
})

test('stage-specific creation reuses the existing Ticket flow and responsive design', () => {
  assert.match(page, /Create in \{stage\.name\}/)
  assert.match(page, /initialStage=\{createStage\.slug\}/)
  assert.match(page, /pipelineId=\{pipelineId\}/)
  assert.match(creation, /initialStage \|\| \(area === 'leads'/)
  assert.match(migration, /app\.crm_requested_pipeline_id/)
  assert.match(styles, /\.pipeline-board-scroll \{ overflow-x:auto/)
  assert.match(styles, /@media \(max-width:760px\)[\s\S]*\.pipeline-board/)
  assert.match(styles, /prefers-reduced-motion/)
})
