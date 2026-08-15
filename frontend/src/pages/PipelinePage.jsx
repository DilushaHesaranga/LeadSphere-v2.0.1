import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'
import { TicketCreationFlow } from '../components/TicketCreationFlow.jsx'
import { Icon } from '../components/Icons.jsx'
import { formatDateTime } from '../config/crm.js'
import {
  canMovePipelineCard, formatStageAge, mergePipelineStagePage,
  parsePipelineFilters, PIPELINE_CATEGORIES, PIPELINE_SORTS, serializePipelineFilters,
} from '../config/pipeline.js'
import { pipelineService } from '../services/pipelineService.js'
import { navigate } from '../utils/router.js'

const PAGE_SIZE = 20

function PipelineCard({ card, stages, mayMove, pending, onMove, onDragStart, onDragEnd }) {
  const canMove = mayMove && card.canMove && card.status === 'active'
  return <article className={`pipeline-card ${pending ? 'pending' : ''}`} draggable={canMove && !pending} onDragStart={(event) => onDragStart(event, card)} onDragEnd={onDragEnd} aria-busy={pending}>
    <header>
      <button className="pipeline-card-title" type="button" onClick={() => navigate(`/console/tickets/${card.id}`)}>{card.projectTitle}</button>
      <span className="pipeline-ticket-number">#{card.ticketNumber}</span>
    </header>
    <button className="pipeline-company" type="button" onClick={() => navigate(`/console/cases/${card.caseId}`)}>{card.companyName}</button>
    <dl className="pipeline-card-details">
      <div><dt>Manager</dt><dd>{card.responsibleManagerName}</dd></div>
      <div><dt>In stage</dt><dd>{formatStageAge(card.stageAgeSeconds)}</dd></div>
      <div className="pipeline-assignees"><dt>Assigned</dt><dd>{card.assignedUsers?.map((user) => user.name).join(', ') || 'No active assignments'}</dd></div>
      <div><dt>Follow Up</dt><dd className={card.hasOverdueFollowUp ? 'pipeline-overdue' : ''}>{card.hasOverdueFollowUp ? 'Overdue' : card.nextFollowUpAt ? formatDateTime(card.nextFollowUpAt) : 'None scheduled'}</dd></div>
    </dl>
    <footer>
      <label><span className="sr-only">Move {card.projectTitle} to another stage</span><select value={card.stage} disabled={!canMove || pending} onChange={(event) => onMove(card, event.target.value, 'BOARD_MENU')} aria-label={`Move ${card.projectTitle} to another stage`}>{stages.map((stage) => <option key={stage.slug} value={stage.slug}>{stage.name}</option>)}</select></label>
      <span className={`pipeline-status pipeline-status-${card.status}`}>{card.status}</span>
    </footer>
  </article>
}

function PipelineColumn({ stage, allStages, mayMove, pendingIds, dropStage, onDropStage, onMove, onCreate, onLoadMore, onDragStart, onDragEnd }) {
  return <section className={`pipeline-column pipeline-column-${stage.category} ${dropStage === stage.slug ? 'drop-target' : ''}`} aria-labelledby={`pipeline-stage-${stage.slug}`} onDragOver={(event) => { event.preventDefault(); onDropStage(stage.slug) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onDropStage('') }} onDrop={(event) => { event.preventDefault(); onDropStage(stage.slug, true) }}>
    <header className="pipeline-column-heading">
      <div><h2 id={`pipeline-stage-${stage.slug}`}>{stage.name}</h2><span>{stage.totalCount} {stage.totalCount === 1 ? 'Ticket' : 'Tickets'}</span></div>
      <div className="pipeline-stage-meta"><span>{Number(stage.probability)}%</span><small>{stage.category}</small></div>
    </header>
    <div className="pipeline-column-body">
      {stage.cards.map((card) => <PipelineCard key={card.id} card={card} stages={allStages} mayMove={mayMove} pending={pendingIds.has(card.id)} onMove={onMove} onDragStart={onDragStart} onDragEnd={onDragEnd}/>)}
      {!stage.cards.length && <div className="pipeline-column-empty"><Icon name="briefcase" size={21}/><span>No Tickets in this stage.</span></div>}
    </div>
    <footer className="pipeline-column-actions">
      {stage.hasMore && <button className="text-button" type="button" onClick={() => onLoadMore(stage)} disabled={stage.loadingMore}>{stage.loadingMore ? 'Loading...' : 'Load more'}</button>}
      {onCreate && <button className="text-button" type="button" onClick={() => onCreate(stage)}><Icon name="plus" size={14}/>Create in {stage.name}</button>}
    </footer>
  </section>
}

export function PipelinePage() {
  const { can, user } = useAuth()
  const initialFilters = useMemo(() => parsePipelineFilters(window.location.search), [])
  const [filters, setFilters] = useState(initialFilters)
  const [debouncedSearch, setDebouncedSearch] = useState(initialFilters.search)
  const [pipelines, setPipelines] = useState([])
  const [pipelineId, setPipelineId] = useState('')
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pendingIds, setPendingIds] = useState(() => new Set())
  const [dropStage, setDropStage] = useState('')
  const [createStage, setCreateStage] = useState(null)
  const draggedCard = useRef(null)
  const requestSequence = useRef(0)
  const mayMove = can(PERMISSIONS.DEALS_MOVE_STAGE) || can(PERMISSIONS.LEADS_CHANGE_STATUS)
  const mayCreate = can(PERMISSIONS.TICKETS_CREATE) && can(PERMISSIONS.CASES_CREATE)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [filters.search])

  useEffect(() => {
    let active = true
    pipelineService.listPipelines().then((result) => {
      if (!active) return
      const items = result?.items ?? []
      setPipelines(items)
      const queryId = new URLSearchParams(window.location.search).get('pipeline')
      const savedId = window.localStorage.getItem(`leadsphere:pipeline:${user?.id ?? 'anonymous'}`)
      const selected = items.find((item) => item.id === queryId)?.id ?? items.find((item) => item.id === savedId)?.id ?? items.find((item) => item.isDefault)?.id ?? items[0]?.id ?? ''
      setPipelineId(selected)
    }).catch((loadError) => { if (active) { setError(loadError.message); setLoading(false) } })
    return () => { active = false }
  }, [user?.id])

  const loadBoard = useCallback(async ({ quiet = false } = {}) => {
    if (!pipelineId) { setLoading(false); return }
    const sequence = ++requestSequence.current
    if (!quiet) setLoading(true)
    setError('')
    try {
      const result = await pipelineService.loadBoard({ pipelineId, search: debouncedSearch, ownerId: filters.ownerId, category: filters.category, stageAgeDays: filters.stageAgeDays, sort: filters.sort, pageSize: PAGE_SIZE })
      if (sequence === requestSequence.current) setBoard(result)
    } catch (loadError) {
      if (sequence === requestSequence.current) setError(loadError.message)
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [debouncedSearch, filters.category, filters.ownerId, filters.sort, filters.stageAgeDays, pipelineId])

  useEffect(() => { loadBoard() }, [loadBoard])

  useEffect(() => {
    if (!pipelineId) return
    window.localStorage.setItem(`leadsphere:pipeline:${user?.id ?? 'anonymous'}`, pipelineId)
    const query = serializePipelineFilters({ ...filters, search: debouncedSearch }, pipelineId)
    window.history.replaceState({}, '', `/console/pipeline${query}`)
  }, [debouncedSearch, filters, pipelineId, user?.id])

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }))
  const clearFilters = () => { setFilters({ search: '', ownerId: '', category: '', stageAgeDays: '', sort: 'recent' }); setDebouncedSearch('') }

  const moveCard = async (card, destination, source = 'BOARD_DRAG') => {
    if (!canMovePipelineCard(card, destination, mayMove && card.canMove) || pendingIds.has(card.id)) return
    setPendingIds((current) => new Set(current).add(card.id)); setError(''); setMessage('')
    try {
      await pipelineService.moveTicket({ ticketId: card.id, pipelineId, stage: destination, expectedVersion: card.pipelineVersion, source, idempotencyKey: crypto.randomUUID() })
      setMessage(`${card.projectTitle} moved successfully.`)
      await loadBoard({ quiet: true })
    } catch (moveError) {
      setError(moveError.message)
      await loadBoard({ quiet: true })
    } finally {
      setPendingIds((current) => { const next = new Set(current); next.delete(card.id); return next })
      setDropStage(''); draggedCard.current = null
    }
  }

  const handleDropStage = (stageSlug, dropped = false) => {
    setDropStage(stageSlug)
    if (dropped && draggedCard.current) moveCard(draggedCard.current, stageSlug)
  }

  const loadMore = async (stage) => {
    const nextPage = (stage.loadedPage ?? 1) + 1
    setBoard((current) => ({ ...current, stages: current.stages.map((item) => item.slug === stage.slug ? { ...item, loadingMore: true } : item) }))
    try {
      const result = await pipelineService.loadBoard({ pipelineId, search: debouncedSearch, ownerId: filters.ownerId, category: filters.category, stageAgeDays: filters.stageAgeDays, sort: filters.sort, page: nextPage, pageSize: PAGE_SIZE })
      setBoard((current) => mergePipelineStagePage(current, result, stage.slug))
    } catch (loadError) {
      setError(loadError.message)
      setBoard((current) => ({ ...current, stages: current.stages.map((item) => item.slug === stage.slug ? { ...item, loadingMore: false } : item) }))
    }
  }

  const stages = board?.stages ?? pipelines.find((item) => item.id === pipelineId)?.stages ?? []
  const filtersActive = Boolean(filters.search || filters.ownerId || filters.category || filters.stageAgeDays !== '' || filters.sort !== 'recent')

  return <div className="console-content pipeline-page">
    <div className="crm-heading pipeline-heading">
      <div><span className="section-kicker">Sales workspace</span><h1>Pipeline</h1><p>Move authorised Tickets through the sales journey without losing assignment, customer, or audit context.</p></div>
      <div className="heading-actions">
        {pipelines.length > 1 && <label className="pipeline-selector"><span>Pipeline</span><select value={pipelineId} onChange={(event) => setPipelineId(event.target.value)}>{pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select></label>}
        {mayCreate && <button className="button button-primary" type="button" onClick={() => setCreateStage(stages[0] ?? null)}><Icon name="plus" size={17}/>Create Ticket</button>}
      </div>
    </div>
    <section className="pipeline-filters" aria-label="Pipeline filters">
      <label className="field pipeline-search"><span>Search</span><span className="input-with-icon"><Icon name="search" size={16}/><input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Ticket, project, or company"/></span></label>
      <label className="field"><span>Owner or assignee</span><select value={filters.ownerId} onChange={(event) => updateFilter('ownerId', event.target.value)}><option value="">Everyone</option>{(board?.owners ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
      <label className="field"><span>Stage category</span><select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}>{PIPELINE_CATEGORIES.map((category) => <option key={category.value || 'all'} value={category.value}>{category.label}</option>)}</select></label>
      <label className="field"><span>Minimum stage age</span><select value={filters.stageAgeDays} onChange={(event) => updateFilter('stageAgeDays', event.target.value)}><option value="">Any age</option><option value="1">1+ days</option><option value="3">3+ days</option><option value="7">7+ days</option><option value="14">14+ days</option><option value="30">30+ days</option></select></label>
      <label className="field"><span>Sort cards</span><select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}>{PIPELINE_SORTS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}</select></label>
      {filtersActive && <button className="text-button pipeline-clear" type="button" onClick={clearFilters}>Clear filters</button>}
    </section>
    {error && <div className="alert alert-error" role="alert">{error}<button className="text-button" type="button" onClick={() => loadBoard()}>Retry</button></div>}
    {message && <div className="alert alert-success" role="status">{message}</div>}
    {loading && <div className="pipeline-loading" aria-live="polite"><span className="loading-state">Loading pipeline...</span></div>}
    {!loading && !error && !pipelines.length && <div className="empty-state module-empty"><Icon name="briefcase" size={28}/><h2>No active pipeline is configured.</h2><p>Ask a system administrator to configure the default sales pipeline.</p></div>}
    {!loading && board && <><div className="pipeline-board-summary"><strong>{board.totalCount} matching {board.totalCount === 1 ? 'Ticket' : 'Tickets'}</strong><span>Drag cards or use each card's stage selector. Changes are checked and recorded by the server.</span></div>{board.totalCount === 0 && <div className="pipeline-filtered-empty" role="status"><Icon name="filter" size={17}/><span><strong>{filtersActive ? 'No Tickets match these filters.' : 'This pipeline has no Tickets yet.'}</strong>{filtersActive ? ' Clear or change a filter to broaden the board.' : ' Use a stage action to create the first Ticket.'}</span></div>}<div className="pipeline-board-scroll" tabIndex="0" aria-label={`${board.pipeline.name} board. Scroll horizontally to view every stage.`}><div className="pipeline-board" style={{ '--pipeline-columns': Math.max(stages.length, 1) }}>{stages.map((stage) => <PipelineColumn key={stage.slug} stage={stage} allStages={pipelines.find((item) => item.id === pipelineId)?.stages ?? stages} mayMove={mayMove} pendingIds={pendingIds} dropStage={dropStage} onDropStage={handleDropStage} onMove={moveCard} onCreate={mayCreate ? setCreateStage : null} onLoadMore={loadMore} onDragStart={(event, card) => { draggedCard.current = card; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', card.id) }} onDragEnd={() => { draggedCard.current = null; setDropStage('') }}/>)}</div></div></>}
    {createStage && <TicketCreationFlow
      area={createStage.businessArea}
      pipelineId={pipelineId}
      initialStage={createStage.slug}
      onClose={() => setCreateStage(null)}
      onCreated={(result) => { setCreateStage(null); navigate(`/console/tickets/${result.ticketId}`) }}
    />}
  </div>
}
