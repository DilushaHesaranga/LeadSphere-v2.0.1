import { expect, test } from '@playwright/test'
import { expectNoPageErrors, installSprint2Mocks, openEmailTemplate } from '../../fixtures/sprint2-fixtures.js'

test.describe('Sprint 2 — Email Templates', () => {
  test('EMAIL-01 valid: prepares a realistic Gmail draft for review', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    const form = await openEmailTemplate(page)
    await form.getByLabel('To', { exact: true }).fill('customer@example.test')
    await form.getByLabel('Subject', { exact: true }).fill('Playwright Test Template')
    await form.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello,\n\nPlease review the proposal before our next meeting.\n\nBest regards')
    await form.getByRole('button', { name: 'Send email', exact: true }).click()

    const opened = await page.evaluate(() => window.__openedUrls)
    expect(opened).toHaveLength(1)
    const draft = new URL(opened[0])
    expect(draft.hostname).toBe('mail.google.com')
    expect(draft.searchParams.get('to')).toBe('customer@example.test')
    expect(draft.searchParams.get('su')).toBe('Playwright Test Template')
    await expectNoPageErrors(state)
  })

  test('EMAIL-02 invalid: rejects an unsupported recipient address', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    const form = await openEmailTemplate(page)
    const recipient = form.getByLabel('To', { exact: true })
    await recipient.fill('not-an-email')
    await form.getByRole('button', { name: 'Send email', exact: true }).click()

    expect(await recipient.evaluate((input) => input.validity.typeMismatch)).toBe(true)
    expect(await recipient.evaluate((input) => input.validationMessage.length > 0)).toBe(true)
    expect(await page.evaluate(() => window.__openedUrls)).toEqual([])
    await expectNoPageErrors(state)
  })

  test('EMAIL-03 validation: required subject cannot be empty', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    const form = await openEmailTemplate(page)
    const subject = form.getByLabel('Subject', { exact: true })
    await subject.fill('')
    await form.getByRole('button', { name: 'Send email', exact: true }).click()

    expect(await subject.evaluate((input) => input.validity.valueMissing)).toBe(true)
    expect(await subject.evaluate((input) => input.validationMessage.length > 0)).toBe(true)
    expect(await page.evaluate(() => window.__openedUrls)).toEqual([])
    await expectNoPageErrors(state)
  })

  test('EMAIL-04 non-functional: template is usable within five seconds', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    const started = Date.now()
    const form = await openEmailTemplate(page)

    expect(Date.now() - started).toBeLessThan(5_000)
    await expect(form.getByLabel('To', { exact: true })).toBeEditable()
    await expect(form.getByLabel('Subject', { exact: true })).toHaveValue(/Following up:/)
    await expect(form.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(/Customer portal upgrade/)
    await expectNoPageErrors(state)
  })
})
