// Local browser QA only. Every Supabase request receives synthetic data.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const screenshotDirectory = resolve(frontendDirectory, '../supabase/.temp/dashboard-qa')
export const testUserId = '10000000-0000-4000-8000-000000000001'
export const testTicketId = '20000000-0000-4000-8000-000000000001'
export const testCaseId = '30000000-0000-4000-8000-000000000001'
export const baseUrl = 'http://127.0.0.1:4179'
const supabaseHost = 'dashboard-test.supabase.co'

export const authorization = {
  profile: { id: testUserId, display_name: 'Maya Silva', theme_mode: 'light' },
  roles: [{ slug: 'leadership', name: 'Leadership' }],
  teams: [],
  permissions: { 'console.access': 'company', 'dashboards.read': 'company', 'reports.read': 'company', 'tickets.read': 'company', 'cases.read': 'company', 'pipeline.read': 'company' },
}

export const referenceData = {
  departments: [{ slug: 'sales', name: 'Sales' }, { slug: 'delivery', name: 'Delivery' }],
  stages: [{ slug: 'negotiation', name: 'Negotiation' }, { slug: 'close_won', name: 'Close won' }],
  managers: [{ id: testUserId, name: 'Maya Silva', roleSlug: 'sales_manager' }],
}

export const ticket = {
  id: testTicketId, caseId: testCaseId, projectTitle: 'Customer portal upgrade', companyName: 'Acme Lanka',
  stage: 'negotiation', status: 'active', currentDepartment: 'sales',
  responsibleManagerId: testUserId, responsibleManagerName: 'Maya Silva',
  createdAt: '2026-09-01T06:00:00Z', updatedAt: '2026-09-12T06:00:00Z',
  assignedUsers: [], contacts: [], notes: [], activity: [], requests: [],
}

export async function startApplication() {
  const application = spawn(process.execPath, [resolve(frontendDirectory, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4179', '--strictPort'], {
    cwd: frontendDirectory,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_SUPABASE_URL: `https://${supabaseHost}`, VITE_SUPABASE_PUBLISHABLE_KEY: 'dashboard-qa-public-placeholder', VITE_AI_ASSISTANT_ENABLED: 'false' },
  })
  let output = ''
  application.stdout.on('data', (chunk) => { output += chunk })
  application.stderr.on('data', (chunk) => { output += chunk })
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (application.exitCode !== null) throw new Error(`QA server exited: ${output}`)
    try {
      const response = await fetch(baseUrl)
      if (response.ok && output.includes(baseUrl)) return application
    } catch { /* Wait for the local server. */ }
    await delay(250)
  }
  application.kill()
  throw new Error(`QA server did not start: ${output}`)
}

export async function launchBrowser() {
  const require = createRequire(import.meta.url)
  let playwright
  try { playwright = require('playwright') }
  catch {
    const directory = process.env.PLAYWRIGHT_MODULE_DIR || resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
    playwright = require(directory)
  }
  return playwright.chromium.launch({ channel: 'chrome', headless: true })
}

export async function createScenario(browser, { viewport = { width: 1440, height: 1000 }, access = authorization, rpc }) {
  const context = await browser.newContext({ viewport, colorScheme: 'light', locale: 'en-GB', timezoneId: 'Asia/Colombo' })
  const requests = []
  const unexpectedRequests = []
  const pageErrors = []
  const session = {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: testUserId, exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url')}.synthetic`,
    refresh_token: 'synthetic-refresh-token', token_type: 'bearer', expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: { id: testUserId, email: 'maya@example.test', aud: 'authenticated', role: 'authenticated' },
  }
  await context.addInitScript(({ value }) => { localStorage.setItem('sb-dashboard-test-auth-token', JSON.stringify(value)) }, { value: session })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === baseUrl) return route.continue()
    if (url.hostname !== supabaseHost) {
      unexpectedRequests.push(request.url())
      return route.abort()
    }
    const name = url.pathname.split('/').at(-1)
    const parameters = request.postDataJSON() ?? {}
    requests.push({ name, parameters })
    const respond = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (name === 'current_user_authorization') return respond(access)
    if (name === 'get_user_notifications') return respond({ items: [], unreadCount: 0 })
    if (name === 'get_crm_reference_data') return respond(referenceData)
    if (name === 'get_crm_ticket') return respond(ticket)
    if (name === 'get_crm_ticket_sales') return respond({ ticketId: testTicketId, dealValue: 350000, currency: 'LKR' })
    if (name === 'user') return respond(session.user)
    if (await rpc({ name, parameters, respond })) return
    unexpectedRequests.push(`${request.method()} ${url.pathname}`)
    await respond({ message: `Unstubbed QA request: ${name}` }, 500)
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  return { context, page, requests, pageErrors, unexpectedRequests }
}
