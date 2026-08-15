export const PIPELINE_CATEGORIES = Object.freeze([
  { value: '', label: 'All stages' },
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
])

export const PIPELINE_SORTS = Object.freeze([
  { value: 'recent', label: 'Recently updated' },
  { value: 'oldest_stage', label: 'Oldest in stage' },
  { value: 'company', label: 'Company A–Z' },
  { value: 'title', label: 'Ticket title A–Z' },
])

const DEFAULT_FILTERS = Object.freeze({
  search: '',
  ownerId: '',
  category: '',
  stageAgeDays: '',
  sort: 'recent',
})

export function validateStageProbability(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 100) return false
  return Math.round(number * 100) === number * 100
}

function decimalParts(value) {
  const normalized = String(value ?? '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function calculateExpectedRevenue(amount, probability) {
  const amountCents = decimalParts(amount)
  if (amountCents === null || !validateStageProbability(probability)) return null
  const probabilityBasisPoints = BigInt(Math.round(Number(probability) * 100))
  const weightedCents = (amountCents * probabilityBasisPoints + 5000n) / 10000n
  return `${weightedCents / 100n}.${String(weightedCents % 100n).padStart(2, '0')}`
}

export function formatStageAge(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0)
  const days = Math.floor(safeSeconds / 86400)
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'}`
  const hours = Math.floor(safeSeconds / 3600)
  if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const minutes = Math.floor(safeSeconds / 60)
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

export function formatStageDuration(seconds) {
  if (seconds === null || seconds === undefined) return 'Initial stage'
  return formatStageAge(seconds)
}

export function parsePipelineFilters(search = '') {
  const params = new URLSearchParams(search)
  const sort = PIPELINE_SORTS.some((item) => item.value === params.get('sort')) ? params.get('sort') : DEFAULT_FILTERS.sort
  const category = PIPELINE_CATEGORIES.some((item) => item.value === params.get('category')) ? (params.get('category') ?? '') : ''
  const age = params.get('age')
  return {
    ...DEFAULT_FILTERS,
    search: params.get('q')?.trim() ?? '',
    ownerId: params.get('owner') ?? '',
    category,
    stageAgeDays: age && /^\d+$/.test(age) ? age : '',
    sort,
  }
}

export function serializePipelineFilters(filters = {}, pipelineId = '') {
  const params = new URLSearchParams()
  if (pipelineId) params.set('pipeline', pipelineId)
  if (filters.search?.trim()) params.set('q', filters.search.trim())
  if (filters.ownerId) params.set('owner', filters.ownerId)
  if (filters.category) params.set('category', filters.category)
  if (filters.stageAgeDays !== '' && filters.stageAgeDays !== null && filters.stageAgeDays !== undefined) params.set('age', String(filters.stageAgeDays))
  if (filters.sort && filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function mergePipelineStagePage(board, pageResult, stageSlug) {
  if (!board || !pageResult) return board
  const nextStage = pageResult.stages?.find((stage) => stage.slug === stageSlug)
  if (!nextStage) return board
  return {
    ...board,
    stages: board.stages.map((stage) => stage.slug !== stageSlug ? stage : {
      ...stage,
      cards: [...stage.cards, ...nextStage.cards.filter((card) => !stage.cards.some((current) => current.id === card.id))],
      hasMore: nextStage.hasMore,
      loadedPage: pageResult.page,
      loadingMore: false,
    }),
  }
}

export function canMovePipelineCard(card, destinationStage, mayMove) {
  return Boolean(mayMove && card?.status === 'active' && destinationStage && destinationStage !== card.stage)
}
