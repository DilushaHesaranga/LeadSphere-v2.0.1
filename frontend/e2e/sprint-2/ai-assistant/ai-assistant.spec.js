import { expect, test } from '@playwright/test'
import { expectNoPageErrors, installSprint2Mocks, openAssistant } from '../../fixtures/sprint2-fixtures.js'

test.describe('Sprint 2 — AI Assistant', () => {
  test('AI-01 valid: answers a realistic ticket question', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    await openAssistant(page)
    await page.getByLabel('Ask about this ticket', { exact: true }).fill('What should I discuss during the next customer follow-up?')
    await page.getByRole('button', { name: 'Ask assistant', exact: true }).click()

    await expect(page.getByRole('log', { name: 'Ticket assistant conversation' }).getByText('What should I discuss during the next customer follow-up?', { exact: true })).toBeVisible()
    await expect(page.locator('.assistant-message.assistant')).toBeVisible()
    await expect(page.getByText('AI-generated · Verify against the records', { exact: true })).toBeVisible()
    expect(state.assistantAskCount).toBe(1)
    await expectNoPageErrors(state)
  })

  test('AI-02 invalid: service failure is handled with a retry option', async ({ page }) => {
    const state = await installSprint2Mocks(page, { assistantFailure: true })
    await openAssistant(page)
    await page.getByLabel('Ask about this ticket', { exact: true }).fill('Give me unsupported information from another ticket.')
    await page.getByRole('button', { name: 'Ask assistant', exact: true }).click()

    await expect(page.getByRole('alert')).toContainText('AI Assistant is temporarily unavailable')
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ask assistant', exact: true })).toBeEnabled()
    await expectNoPageErrors(state)
  })

  test('AI-03 validation: whitespace-only question remains blocked', async ({ page }) => {
    const state = await installSprint2Mocks(page)
    await openAssistant(page)
    await page.getByLabel('Ask about this ticket', { exact: true }).fill('   ')

    await expect(page.getByRole('button', { name: 'Ask assistant', exact: true })).toBeDisabled()
    expect(state.assistantAskCount).toBe(0)
    await expectNoPageErrors(state)
  })

  test('AI-04 non-functional: promptly shows loading and returns to a usable state', async ({ page }) => {
    const state = await installSprint2Mocks(page, { deferAssistant: true })
    await openAssistant(page)
    await page.getByLabel('Ask about this ticket', { exact: true }).fill('Summarize the current ticket status.')
    const started = Date.now()
    await page.getByRole('button', { name: 'Ask assistant', exact: true }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Reading this ticket and preparing a response' })).toBeVisible()
    expect(Date.now() - started).toBeLessThan(2_000)
    state.releaseAssistant()
    await expect(page.locator('.assistant-message.assistant')).toBeVisible()
    await expect(page.getByLabel('Ask about this ticket', { exact: true })).toBeEditable()
    await expect(page.getByRole('button', { name: 'Ask assistant', exact: true })).toBeDisabled()
    expect(Date.now() - started).toBeLessThan(5_000)
    await expectNoPageErrors(state)
  })
})
