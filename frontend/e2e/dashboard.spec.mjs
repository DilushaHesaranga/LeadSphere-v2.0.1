import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { authorization, baseUrl, createScenario, launchBrowser, screenshotDirectory, startApplication, testTicketId, testUserId } from './dashboard-harness.mjs'
import { filterOptions, overview, recordPage, testPipelineId } from './dashboard-fixtures.mjs'
import { verifyTicketSales } from './ticket-sales-checks.mjs'

const completed = []
const scenarios = []
let browser
let application

async function waitForRequest(scenario, name, predicate = () => true) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const request = scenario.requests.find((item) => item.name === name && predicate(item.parameters))
    if (request) return request.parameters
    await delay(50)
  }
  assert.fail(`Expected request ${name} was not made`)
}

async function scenario(options = {}) {
  const control = { fail: false, empty: false, ...options.control }
  const result = await createScenario(browser, {
    ...options,
    rpc: async ({ name, parameters, respond }) => {
      if (name === 'get_crm_dashboard_filter_options') await respond(filterOptions)
      else if (name === 'get_crm_dashboard') {
        if (control.fail) await respond({ message: 'Synthetic temporary failure' }, 503)
        else await respond(overview(parameters, control.empty))
      } else if (name === 'get_crm_dashboard_records') await respond(recordPage(parameters))
      else return false
      return true
    },
  })
  result.control = control
  scenarios.push(result)
  return result
}

function healthy(result) {
  assert.deepEqual(result.pageErrors, [], 'The browser must have no uncaught application errors')
  assert.deepEqual(result.unexpectedRequests, [], 'The browser must make no unstubbed or external requests')
}

async function noPageOverflow(page) {
  const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }))
  assert.ok(size.content <= size.width + 1, `Page content (${size.content}px) exceeds viewport (${size.width}px)`)
}

async function dashboardReady(page) {
  await page.getByRole('heading', { name: /dashboard/i }).first().waitFor()
  await page.getByRole('button', { name: /Pending tickets/ }).waitFor()
}

function dashboardRequestCount(result) {
  return result.requests.filter(({ name }) => name.startsWith('get_crm_dashboard')).length
}

function navigation(page) {
  return page.getByRole('navigation', { name: 'Console navigation' })
}

async function overviewReady(page) {
  await page.getByRole('heading', { name: 'Good to see you, Maya.', exact: true }).waitFor()
  await navigation(page).getByRole('button', { name: 'Overview', exact: true }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/console')
}

async function verifyDashboardRoles() {
  const allowedRoles = ['marketing_manager', 'sales_manager', 'delivery_manager', 'leadership']
  for (const slug of allowedRoles) {
    const allowed = await scenario({ access: { ...authorization, roles: [{ slug, name: slug }] } })
    await allowed.page.goto(`${baseUrl}/console`)
    await overviewReady(allowed.page)
    assert.equal(dashboardRequestCount(allowed), 0, `${slug}: Overview must not load dashboard data`)
    await navigation(allowed.page).getByRole('button', { name: 'CRM Dashboard', exact: true }).waitFor()
    await allowed.page.goto(`${baseUrl}/console/dashboard`)
    await dashboardReady(allowed.page)
    await waitForRequest(allowed, 'get_crm_dashboard')
    assert.equal(await navigation(allowed.page).getByRole('button', { name: 'CRM Dashboard', exact: true }).count(), 1)
    assert.equal(new URL(allowed.page.url()).pathname, '/console/dashboard')
    healthy(allowed)
    completed.push(`${slug}: Overview stays separate; Dashboard navigation and direct access work`)
  }

  const deniedRoles = ['system_admin', 'marketing_executive', 'sales_executive', 'viewer', 'unknown_role', null]
  for (const slug of deniedRoles) {
    // Keep dashboards.read intentionally: a permission grant cannot bypass the four-role restriction.
    const denied = await scenario({ access: { ...authorization, roles: slug ? [{ slug, name: slug }] : [] } })
    await denied.page.goto(`${baseUrl}/console`)
    await overviewReady(denied.page)
    assert.equal(await navigation(denied.page).getByRole('button', { name: 'CRM Dashboard', exact: true }).count(), 0)
    await denied.page.goto(`${baseUrl}/console/dashboard`)
    await denied.page.getByRole('heading', { name: 'Access denied', exact: true }).waitFor()
    assert.equal(await denied.page.locator('.crm-dashboard').count(), 0)
    assert.equal(dashboardRequestCount(denied), 0, `${slug ?? 'No role'}: denied routes must not request dashboard data`)
    await denied.page.getByRole('button', { name: 'Return to overview', exact: true }).click()
    await overviewReady(denied.page)
    healthy(denied)
    completed.push(`${slug ?? 'No role'}: Dashboard hidden and direct access denied despite dashboards.read; Overview accessible`)
  }

  const mixed = await scenario({ access: { ...authorization, roles: [{ slug: 'system_admin', name: 'System Administrator' }, { slug: 'sales_manager', name: 'Sales Manager' }] } })
  await mixed.page.goto(`${baseUrl}/console/dashboard`)
  await dashboardReady(mixed.page)
  await waitForRequest(mixed, 'get_crm_dashboard')
  healthy(mixed)
  completed.push('Multiple active roles allow Dashboard when at least one is an allowed manager role')
}

try {
  await mkdir(screenshotDirectory, { recursive: true })
  application = await startApplication()
  browser = await launchBrowser()

  const desktop = await scenario()
  await desktop.page.goto(`${baseUrl}/console`)
  await overviewReady(desktop.page)
  assert.equal(dashboardRequestCount(desktop), 0)
  await navigation(desktop.page).getByRole('button', { name: 'CRM Dashboard', exact: true }).click()
  await desktop.page.waitForURL(`${baseUrl}/console/dashboard`)
  await dashboardReady(desktop.page)
  await waitForRequest(desktop, 'get_crm_dashboard')
  assert.equal(await navigation(desktop.page).getByRole('button', { name: 'Overview', exact: true }).count(), 1)
  completed.push('Overview remains the welcome page and opens the separate CRM Dashboard through navigation')
  const salesPanel = desktop.page.locator('.crm-dashboard-sales')
  await salesPanel.getByRole('combobox', { name: /^Sales currency/ }).selectOption('USD')
  assert.ok(await salesPanel.getByText('USD 3,000.00', { exact: true }).count() > 0)
  assert.doesNotMatch(await salesPanel.innerText(), /LKR\s*1,250,000/)
  await salesPanel.getByRole('combobox', { name: /^Sales currency/ }).selectOption('LKR')
  assert.ok(await salesPanel.getByText('LKR 1,250,000.00', { exact: true }).count() > 0)
  completed.push('Sales currency selection keeps recorded values separate')
  await noPageOverflow(desktop.page)
  await desktop.page.screenshot({ path: resolve(screenshotDirectory, 'dashboard-desktop.png'), fullPage: true })
  completed.push('Desktop dashboard renders without page overflow')

  const initialRequestCount = desktop.requests.filter(({ name }) => name === 'get_crm_dashboard').length
  await desktop.page.getByRole('combobox', { name: /^Date range/ }).selectOption('90')
  await desktop.page.getByRole('combobox', { name: /^Department/ }).selectOption('sales')
  await desktop.page.getByRole('combobox', { name: /^Pipeline/ }).selectOption(testPipelineId)
  await desktop.page.getByRole('combobox', { name: /^Owner or assignee/ }).selectOption(testUserId)
  assert.equal(desktop.requests.filter(({ name }) => name === 'get_crm_dashboard').length, initialRequestCount, 'Draft filters should wait for Apply')
  await desktop.page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  const applied = await waitForRequest(desktop, 'get_crm_dashboard', (parameters) => parameters.p_department === 'sales')
  assert.equal(applied.p_pipeline_id, testPipelineId)
  assert.equal(applied.p_owner_id, testUserId)
  assert.equal((new Date(applied.p_to) - new Date(applied.p_from)) / 86400000, 89)
  assert.equal(new URL(desktop.page.url()).searchParams.get('department'), 'sales')
  assert.equal(new URL(desktop.page.url()).pathname, '/console/dashboard', 'Applying filters must retain the dedicated dashboard route')
  completed.push('Date, department, pipeline and owner filters apply together and persist in the URL')

  await dashboardReady(desktop.page)
  const validRequestCount = desktop.requests.filter(({ name }) => name === 'get_crm_dashboard').length
  await desktop.page.getByRole('combobox', { name: /^Date range/ }).selectOption('custom')
  await desktop.page.getByLabel('From', { exact: true }).fill(applied.p_to)
  await desktop.page.getByLabel('To', { exact: true }).fill(applied.p_from)
  await desktop.page.getByRole('button', { name: 'Apply filters', exact: true }).click()
  await desktop.page.getByText('The start date must be on or before the end date.', { exact: true }).waitFor()
  assert.equal(desktop.requests.filter(({ name }) => name === 'get_crm_dashboard').length, validRequestCount)
  completed.push('Invalid date ranges are rejected without replacing the applied dashboard')

  await desktop.page.getByRole('button', { name: /Pending tickets/ }).click()
  const drilldown = await waitForRequest(desktop, 'get_crm_dashboard_records', (parameters) => parameters.p_kind === 'pending')
  assert.equal(drilldown.p_department, 'sales')
  assert.equal(drilldown.p_pipeline_id, testPipelineId)
  assert.equal(drilldown.p_owner_id, testUserId)
  const record = desktop.page.getByRole('row').filter({ hasText: 'Customer portal upgrade' }).first()
  await record.locator('button, a').filter({ hasText: 'Customer portal upgrade' }).click()
  await desktop.page.waitForURL(`**/console/tickets/${testTicketId}`)
  await desktop.page.getByRole('heading', { name: 'Customer portal upgrade', exact: true }).waitFor()
  healthy(desktop)
  completed.push('Summary cards load matching supporting tickets and open ticket details')

  const mobile = await scenario({ viewport: { width: 390, height: 844 } })
  await mobile.page.goto(`${baseUrl}/console/dashboard`)
  await dashboardReady(mobile.page)
  await noPageOverflow(mobile.page)
  await mobile.page.screenshot({ path: resolve(screenshotDirectory, 'dashboard-mobile.png'), fullPage: true })
  await mobile.page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await mobile.page.getByRole('navigation', { name: 'Console navigation' }).waitFor()
  await mobile.page.getByRole('button', { name: 'Close navigation', exact: true }).first().click()
  healthy(mobile)
  completed.push('Mobile dashboard fits the viewport and navigation opens and closes')

  const dark = await scenario({ access: { ...authorization, profile: { ...authorization.profile, theme_mode: 'dark' } } })
  await dark.page.goto(`${baseUrl}/console/dashboard`)
  await dashboardReady(dark.page)
  assert.equal(await dark.page.locator('html').getAttribute('data-theme'), 'dark')
  await noPageOverflow(dark.page)
  await dark.page.screenshot({ path: resolve(screenshotDirectory, 'dashboard-dark.png'), fullPage: true })
  healthy(dark)
  completed.push('Dark appearance retains dashboard layout and fits the viewport')

  const failed = await scenario({ control: { fail: true } })
  await failed.page.goto(`${baseUrl}/console/dashboard`)
  await failed.page.getByText('The dashboard could not be loaded. Please try again.', { exact: true }).waitFor()
  failed.control.fail = false
  await failed.page.getByRole('button', { name: /Retry/i }).click()
  await dashboardReady(failed.page)
  healthy(failed)
  completed.push('A failed dashboard request shows a useful error and recovers on retry')

  const empty = await scenario({ control: { empty: true } })
  await empty.page.goto(`${baseUrl}/console/dashboard`)
  await dashboardReady(empty.page)
  assert.doesNotMatch(await empty.page.locator('body').innerText(), /NaN|undefined|Infinity/)
  await noPageOverflow(empty.page)
  await empty.page.screenshot({ path: resolve(screenshotDirectory, 'dashboard-empty.png'), fullPage: true })
  healthy(empty)
  completed.push('Empty data renders without invented amounts or invalid numbers')

  const permissions = { ...authorization.permissions }
  delete permissions['dashboards.read']
  const restricted = await scenario({ access: { ...authorization, permissions } })
  await restricted.page.goto(`${baseUrl}/console`)
  await overviewReady(restricted.page)
  assert.equal(await navigation(restricted.page).getByRole('button', { name: 'CRM Dashboard', exact: true }).count(), 0)
  await restricted.page.goto(`${baseUrl}/console/dashboard`)
  await restricted.page.getByRole('heading', { name: 'Access denied', exact: true }).waitFor()
  assert.equal(dashboardRequestCount(restricted), 0)
  healthy(restricted)
  completed.push('An allowed role without dashboards.read retains Overview but cannot navigate to or load Dashboard')

  const dashboardOnlyPermissions = { ...authorization.permissions }
  delete dashboardOnlyPermissions['reports.read']
  const dashboardOnly = await scenario({ access: { ...authorization, permissions: dashboardOnlyPermissions } })
  await dashboardOnly.page.goto(`${baseUrl}/console/dashboard`)
  await dashboardReady(dashboardOnly.page)
  assert.equal(await dashboardOnly.page.getByRole('button', { name: /Open Reports/ }).count(), 0)
  assert.equal(dashboardOnly.requests.filter(({ name }) => name.startsWith('get_crm_report')).length, 0)
  healthy(dashboardOnly)
  completed.push('Dashboard permission works independently of reports without a report link or report requests')

  const reportOnlyPermissions = { ...authorization.permissions }
  delete reportOnlyPermissions['tickets.read']
  const reportOnly = await scenario({ access: { ...authorization, permissions: reportOnlyPermissions } })
  await reportOnly.page.goto(`${baseUrl}/console/dashboard`)
  await dashboardReady(reportOnly.page)
  await reportOnly.page.getByRole('button', { name: /Pending tickets/ }).click()
  await reportOnly.page.locator('.crm-dashboard-records').getByText('Customer portal upgrade', { exact: true }).waitFor()
  assert.equal(await reportOnly.page.getByRole('button', { name: 'Customer portal upgrade', exact: true }).count(), 0)
  assert.equal(reportOnly.requests.filter(({ name }) => name === 'get_crm_ticket').length, 0)
  healthy(reportOnly)
  completed.push('Dashboard access alone does not expose ticket navigation controls')

  await verifyDashboardRoles()

  await verifyTicketSales(browser)
  completed.push('Recorded deal values respect read-only access, reject invalid input, save currencies and clear to null')
  console.log(JSON.stringify({ result: 'passed', checks: completed, screenshots: screenshotDirectory }, null, 2))
} catch (error) {
  for (let index = 0; index < scenarios.length; index += 1) {
    const current = scenarios[index]
    if (!current.page.isClosed()) await current.page.screenshot({ path: resolve(screenshotDirectory, `failure-${index}.png`), fullPage: true }).catch(() => {})
  }
  console.error(JSON.stringify({ result: 'failed', completed, scenarioErrors: scenarios.map(({ pageErrors, unexpectedRequests }) => ({ pageErrors, unexpectedRequests })) }, null, 2))
  throw error
} finally {
  await browser?.close()
  application?.kill()
}
