import { expect } from '@playwright/test'
import { filterOptions, overview } from '../dashboard-fixtures.mjs'

export const testUserId = '10000000-0000-4000-8000-000000000001'
export const testTicketId = '20000000-0000-4000-8000-000000000001'
const testCaseId = '30000000-0000-4000-8000-000000000001'
const supabaseHost = 'sprint2-test.supabase.co'

const authorization = {
  profile: { id: testUserId, display_name: 'Maya Silva', theme_mode: 'light', status: 'active' },
  roles: [{ slug: 'sales_manager', name: 'Sales Manager', status: 'active' }],
  teams: [],
  permissions: {
    'console.access': 'company',
    'dashboards.read': 'company',
    'reports.read': 'company',
    'tickets.read': 'company',
    'tickets.notes.create': 'company',
    'tickets.update': 'company',
    'cases.read': 'company',
    'pipeline.read': 'company',
  },
}

const ticket = {
  id: testTicketId,
  caseId: testCaseId,
  projectTitle: 'Customer portal upgrade',
  companyName: 'Acme Lanka',
  stage: 'negotiation',
  status: 'active',
  currentDepartment: 'sales',
  responsibleManagerId: testUserId,
  responsibleManagerName: 'Maya Silva',
  createdAt: '2026-09-01T06:00:00Z',
  updatedAt: '2026-09-12T06:00:00Z',
  assignedUsers: [{ id: testUserId, name: 'Maya Silva' }],
  contacts: [{ id: 'contact-1', name: 'Nimal Perera', email: 'nimal@example.test', phone: '+94112345678' }],
  notes: [],
  activity: [],
  requests: [],
}

const followUp = {
  id: '50000000-0000-4000-8000-000000000001',
  ticketId: testTicketId,
  ticketTitle: ticket.projectTitle,
  ticketNumber: 'LS-1025',
  companyName: ticket.companyName,
  scheduledAt: '2026-10-15T04:30:00.000Z',
  type: 'EMAIL',
  purpose: 'Confirm the proposal and onboarding requirements',
  recurring: false,
  frequency: null,
  seriesId: null,
  seriesActive: false,
  status: 'PENDING',
  createdById: testUserId,
  createdByName: 'Maya Silva',
  createdAt: '2026-09-20T04:30:00.000Z',
  updatedAt: '2026-09-20T04:30:00.000Z',
}

const referenceData = {
  departments: [{ slug: 'sales', name: 'Sales' }],
  stages: [{ slug: 'negotiation', name: 'Negotiation' }],
  managers: [{ id: testUserId, name: 'Maya Silva', roleSlug: 'sales_manager' }],
  assignees: [{ id: testUserId, name: 'Maya Silva', roleSlug: 'sales_manager' }],
  pipelines: [{ id: filterOptions.pipelines[0].id, name: filterOptions.pipelines[0].name }],
}

function session() {
  const expiresAt = Math.floor(Date.now() / 1000) + 86_400
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: testUserId, exp: expiresAt })).toString('base64url')}.synthetic`,
    refresh_token: 'synthetic-refresh-token',
    token_type: 'bearer',
    expires_in: 86_400,
    expires_at: expiresAt,
    user: { id: testUserId, email: 'maya@example.test', aud: 'authenticated', role: 'authenticated' },
  }
}

function assistantAnswer(message) {
  const now = new Date().toISOString()
  return {
    answer: `The ticket is in negotiation. Review the proposal and confirm onboarding requirements before the next follow-up.`,
    sources: [{ id: 'S1', label: 'Ticket overview', excerpt: ticket.projectTitle, tab: 'overview' }],
    generatedAt: now,
    contextAsOf: now,
    contextLimited: false,
    scope: `Current ticket context for: ${message}`,
    email: null,
  }
}

export async function installSprint2Mocks(page, options = {}) {
  const state = {
    pageErrors: [],
    requests: [],
    assistantAskCount: 0,
    releaseAssistant: () => {},
  }
  let releaseAssistant
  const assistantGate = new Promise((resolve) => { releaseAssistant = resolve })
  state.releaseAssistant = releaseAssistant

  const authSession = session()
  await page.addInitScript(({ value }) => {
    localStorage.setItem('sb-sprint2-test-auth-token', JSON.stringify(value))
    window.__openedUrls = []
    window.open = (url) => { window.__openedUrls.push(String(url)); return null }
  }, { value: authSession })
  page.on('pageerror', (error) => state.pageErrors.push(error.message))

  await page.route(`https://${supabaseHost}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1)
    const parameters = request.postDataJSON() ?? {}
    state.requests.push({ name, parameters, path: url.pathname })
    const respond = (body, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    })

    if (url.pathname.endsWith('/functions/v1/ai-assistant')) {
      if (parameters.action === 'status') return respond({ available: true })
      state.assistantAskCount += 1
      if (options.deferAssistant) await assistantGate
      if (options.assistantFailure) {
        return respond({ message: 'AI Assistant is temporarily unavailable. You can continue using all CRM features.' }, 503)
      }
      return respond(assistantAnswer(parameters.message))
    }
    if (name === 'user') return respond(authSession.user)
    if (name === 'current_user_authorization') return respond(authorization)
    if (name === 'get_user_notifications') return respond({ items: [], unreadCount: 0 })
    if (name === 'get_crm_dashboard_filter_options') return respond(filterOptions)
    if (name === 'get_crm_dashboard') {
      if (options.dashboardFailure) return respond({ message: 'Synthetic dashboard service failure' }, 503)
      return respond(overview(parameters))
    }
    if (name === 'list_crm_follow_ups') return respond([followUp])
    if (name === 'get_crm_reference_data') return respond(referenceData)
    if (name === 'get_crm_ticket') return respond(ticket)
    if (name === 'get_crm_ticket_sales') return respond({ ticketId: testTicketId, dealValue: 350000, currency: 'LKR' })
    if (name === 'get_crm_ticket_stage_history') return respond([])
    return respond({ message: `Unstubbed Sprint 2 request: ${name}` }, 500)
  })
  return state
}

export async function expectNoPageErrors(state) {
  expect(state.pageErrors, 'No uncaught browser errors').toEqual([])
}

export async function openEmailTemplate(page) {
  await page.goto('/console/follow-ups')
  const form = page.locator('form.follow-up-email').first()
  await expect(form.getByText('Email template', { exact: true })).toBeVisible()
  return form
}

export async function openAssistant(page) {
  await page.goto(`/console/tickets/${testTicketId}`)
  await expect(page.getByRole('heading', { name: ticket.projectTitle, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'AI Assistant', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'AI Assistant', exact: true })).toBeVisible()
  await expect(page.getByLabel('Ask about this ticket', { exact: true })).toBeEditable()
  await expect(page.getByRole('button', { name: 'Summarize ticket', exact: true })).toBeEnabled()
}
