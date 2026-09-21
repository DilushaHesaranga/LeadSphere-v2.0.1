import { expect, test } from '@playwright/test'
import { expectNoPageErrors, installSprint2Mocks } from '../../fixtures/sprint2-fixtures.js'

test.describe('Sprint 2 — Dashboard', () => {
  test('DASH-01 valid: displays seeded CRM dashboard data', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    await page.goto('/console/dashboard')

    await expect(page.getByRole('heading', { name: 'CRM dashboard', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Total tickets/ })).toContainText('26')
    await expect(page.locator('.crm-dashboard-stage').first()).toContainText('Enterprise sales')
    await expectNoPageErrors(state)
  })

  test('DASH-02 invalid: failed dashboard request shows a safe error', async ({ page }) => {
    const state = await installSprint2Mocks(page, { dashboardFailure: true })
    await page.goto('/console/dashboard')

    await expect(page.getByRole('heading', { name: 'Dashboard unavailable', exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('The dashboard could not be loaded. Please try again.')
    await expect(page.getByRole('button', { name: 'Retry dashboard', exact: true })).toBeVisible()
    await expectNoPageErrors(state)
  })

  test('DASH-03 validation: rejects a start date after the end date', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    await page.goto('/console/dashboard')
    await expect(page.getByRole('button', { name: /Total tickets/ })).toBeVisible()

    const overviewRequests = () => state.requests.filter((request) => request.name === 'get_crm_dashboard').length
    const before = overviewRequests()
    await page.getByRole('combobox', { name: 'Date range', exact: true }).selectOption('custom')
    await page.getByLabel('From', { exact: true }).fill('2026-09-20')
    await page.getByLabel('To', { exact: true }).fill('2026-09-01')
    await page.getByRole('button', { name: 'Apply filters', exact: true }).click()

    await expect(page.getByRole('alert')).toHaveText('The start date must be on or before the end date.')
    expect(overviewRequests()).toBe(before)
    await expectNoPageErrors(state)
  })

  test('DASH-04 non-functional: becomes usable within five seconds without page errors', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    const started = Date.now()
    await page.goto('/console/dashboard')
    await expect(page.getByRole('button', { name: /Pending tickets/ })).toBeVisible()

    expect(Date.now() - started).toBeLessThan(5_000)
    await expect(page.getByRole('form', { name: 'Dashboard filters' })).toBeVisible()
    await expectNoPageErrors(state)
  })
})
