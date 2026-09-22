import { expect, test } from '@playwright/test'
import { expectNoPageErrors, installSprint2Mocks } from '../../fixtures/sprint2-fixtures.js'

test.describe('Sprint 2 — Dashboard', () => {
  test('DASH-01 valid: displays seeded CRM dashboard data', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    await page.goto('/console/dashboard')

    await expect(page.getByRole('heading', { name: 'My CRM dashboard', exact: true })).toBeVisible()
    const totals = page.getByRole('region', { name: 'My ticket totals' })
    await expect(totals).toContainText('My tickets26')
    await expect(page.getByRole('button', { name: 'Customer portal upgrade', exact: true })).toBeVisible()
    await expectNoPageErrors(state)
  })

  test('DASH-02 invalid: failed dashboard request shows a safe error', async ({ page }) => {
    const state = await installSprint2Mocks(page, { dashboardFailure: true })
    await page.goto('/console/dashboard')

    await expect(page.getByRole('alert')).toContainText('The dashboard could not be loaded. Please try again.')
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await expectNoPageErrors(state)
  })

  test('DASH-03 validation: filters assigned tickets by search text', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    await page.goto('/console/dashboard')
    await expect(page.getByRole('button', { name: 'Customer portal upgrade', exact: true })).toBeVisible()

    const personalRequests = () => state.requests.filter((request) => request.name === 'get_crm_personal_dashboard').length
    const before = personalRequests()
    const search = page.getByRole('textbox', { name: 'Search my tickets', exact: true })
    await search.fill('not assigned to me')

    await expect(page.getByText('No tickets match your search.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Customer portal upgrade', exact: true })).toHaveCount(0)
    expect(personalRequests()).toBe(before)
    await expectNoPageErrors(state)
  })

  test('DASH-04 non-functional: becomes usable within five seconds without page errors', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    const started = Date.now()
    await page.goto('/console/dashboard')
    await expect(page.getByRole('heading', { name: 'Call priority', exact: true })).toBeVisible()

    expect(Date.now() - started).toBeLessThan(5_000)
    await expect(page.getByRole('textbox', { name: 'Search my tickets', exact: true })).toBeEditable()
    await expectNoPageErrors(state)
  })
})
