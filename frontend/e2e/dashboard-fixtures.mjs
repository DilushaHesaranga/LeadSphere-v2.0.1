import { testTicketId, testUserId, ticket } from './dashboard-harness.mjs'

export const testPipelineId = '40000000-0000-4000-8000-000000000001'
export const filterOptions = {
  timezone: 'Asia/Colombo',
  pipelines: [{ id: testPipelineId, name: 'Enterprise sales' }],
  stages: [],
  owners: [{ id: testUserId, name: 'Maya Silva' }],
}

export function overview(parameters, empty = false) {
  const currentMonth = `${parameters.p_to.slice(0, 7)}-01`
  return {
    timezone: 'Asia/Colombo', period: { from: parameters.p_from, to: parameters.p_to }, asOf: new Date().toISOString(),
    metrics: empty ? {
      totalTickets: 0, pendingTickets: 0, closedTickets: 0, newTickets: 0, wonTickets: 0, lostTickets: 0,
      currentWonTickets: 0, currentLostTickets: 0, overdueFollowUps: 0, dueTodayFollowUps: 0,
      upcomingFollowUps: 0, completedFollowUps: 0, staleTickets: 0, unassignedTickets: 0, winRate: null,
    } : {
      totalTickets: 26, pendingTickets: 18, closedTickets: 8, newTickets: 14, wonTickets: 6, lostTickets: 2,
      currentWonTickets: 6, currentLostTickets: 2, overdueFollowUps: 3, dueTodayFollowUps: 4,
      upcomingFollowUps: 5, completedFollowUps: 11, staleTickets: 2, unassignedTickets: 1, winRate: 75,
    },
    pipeline: empty ? [] : [
      { stage: 'qualification', stageName: 'Qualification', pipelineId: testPipelineId, pipelineName: 'Enterprise sales', category: 'open', count: 5, averageAgeDays: 3 },
      { stage: 'proposal_or_price_quote', stageName: 'Proposal or Price Quote', pipelineId: testPipelineId, pipelineName: 'Enterprise sales', category: 'open', count: 4, averageAgeDays: 6 },
      { stage: 'negotiation', stageName: 'Negotiation', pipelineId: testPipelineId, pipelineName: 'Enterprise sales', category: 'open', count: 6, averageAgeDays: 9 },
      { stage: 'sales_order', stageName: 'Sales Order', pipelineId: testPipelineId, pipelineName: 'Enterprise sales', category: 'open', count: 3, averageAgeDays: 2 },
      { stage: 'close_won', stageName: 'Close won', pipelineId: testPipelineId, pipelineName: 'Enterprise sales', category: 'won', count: 6, averageAgeDays: 4 },
      { stage: 'lost', stageName: 'Lost', pipelineId: testPipelineId, pipelineName: 'Enterprise sales', category: 'lost', count: 2, averageAgeDays: 5 },
    ],
    sales: empty ? [] : [
      { currency: 'LKR', wonValue: 1250000, pipelineValue: 900000, weightedPipelineValue: 530000, wonWithValue: 4, wonMissingValue: 1, pipelineWithValue: 12, pipelineMissingValue: 3 },
      { currency: 'USD', wonValue: 3000, pipelineValue: 1000, weightedPipelineValue: 700, wonWithValue: 1, wonMissingValue: 0, pipelineWithValue: 3, pipelineMissingValue: 0 },
    ],
    salesCoverage: empty ? { wonTickets: 0, wonWithValue: 0, wonMissingValue: 0, pipelineTickets: 0, pipelineWithValue: 0, pipelineMissingValue: 0 }
      : { wonTickets: 6, wonWithValue: 5, wonMissingValue: 1, pipelineTickets: 18, pipelineWithValue: 15, pipelineMissingValue: 3 },
    salesTrend: empty ? [] : [
      { month: currentMonth, currency: 'LKR', wonValue: 1250000, wonCount: 5, withValue: 4, missingValue: 1 },
      { month: currentMonth, currency: 'USD', wonValue: 3000, wonCount: 1, withValue: 1, missingValue: 0 },
    ],
    team: empty ? [] : [
      { managerId: testUserId, managerName: 'Maya Silva', total: 16, pending: 12, won: 3, lost: 1, closed: 4 },
      { managerId: '10000000-0000-4000-8000-000000000002', managerName: 'Ravi Perera', total: 10, pending: 6, won: 3, lost: 1, closed: 4 },
    ],
    departments: empty ? [] : [
      { department: 'sales', label: 'Sales', total: 20, pending: 15, won: 4, lost: 1 },
      { department: 'delivery', label: 'Delivery', total: 6, pending: 3, won: 2, lost: 1 },
    ],
    followUps: empty ? [] : [{ id: '50000000-0000-4000-8000-000000000001', ticketId: testTicketId,
      projectTitle: ticket.projectTitle, companyName: ticket.companyName, type: 'EMAIL', purpose: 'Confirm the proposal and final price',
      scheduledAt: new Date(Date.now() - 86400000).toISOString(), status: 'PENDING' }],
    attention: empty ? [] : [{ kind: 'overdue', count: 3 }, { kind: 'stale', count: 2 }, { kind: 'unassigned', count: 1 }],
  }
}

export function recordPage(parameters) {
  return { total: 1, page: parameters.p_page, pageSize: 10, records: [{
    id: testTicketId, projectTitle: ticket.projectTitle, companyName: ticket.companyName,
    stage: ticket.stage, stageName: 'Negotiation', status: ticket.status, department: 'sales',
    managerName: ticket.responsibleManagerName, stageAgeDays: 9, dealValue: 350000, currency: 'LKR',
  }] }
}
