import assert from 'node:assert/strict'
import { authorization, baseUrl, createScenario, testTicketId } from './dashboard-harness.mjs'

export async function verifyTicketSales(browser) {
  const readonly = await createScenario(browser, { rpc: async () => false })
  try {
    await readonly.page.goto(`${baseUrl}/console/tickets/${testTicketId}`)
    const panel = readonly.page.getByRole('region', { name: 'Recorded deal value' })
    await panel.getByText('LKR 350,000.00', { exact: true }).waitFor()
    assert.equal(await panel.getByRole('button', { name: 'Edit value' }).count(), 0)
    assert.deepEqual(readonly.pageErrors, [])
    assert.deepEqual(readonly.unexpectedRequests, [])
  } finally { await readonly.context.close() }

  const edits = []
  const editable = await createScenario(browser, {
    access: { ...authorization, permissions: { ...authorization.permissions, 'tickets.update': 'company' } },
    rpc: async ({ name, parameters, respond }) => {
      if (name !== 'update_crm_ticket_sales') return false
      edits.push(parameters)
      await respond({ ticketId: parameters.p_ticket_id, dealValue: parameters.p_deal_value, currency: parameters.p_currency })
      return true
    },
  })
  try {
    await editable.page.goto(`${baseUrl}/console/tickets/${testTicketId}`)
    const panel = editable.page.getByRole('region', { name: 'Recorded deal value' })
    await panel.getByRole('button', { name: 'Edit value' }).click()
    await panel.getByLabel(/Deal value/).fill('-1')
    await panel.getByRole('button', { name: 'Save value' }).click()
    await panel.getByText('Enter a positive amount or zero, with up to two decimal places.').waitFor()
    assert.equal(edits.length, 0, 'Invalid values must never be sent to the server')
    await panel.getByLabel(/Deal value/).fill('1200.50')
    await panel.getByRole('combobox', { name: /^Currency/ }).selectOption('USD')
    await panel.getByRole('button', { name: 'Save value' }).click()
    await panel.getByText('Recorded deal value saved.', { exact: true }).waitFor()
    await panel.getByText('USD 1,200.50', { exact: true }).waitFor()
    assert.deepEqual(edits[0], { p_ticket_id: testTicketId, p_deal_value: 1200.5, p_currency: 'USD' })

    await panel.getByRole('button', { name: 'Edit value' }).click()
    await panel.getByLabel(/Deal value/).fill('')
    await panel.getByRole('button', { name: 'Save value' }).click()
    await panel.getByText('Recorded deal value cleared.', { exact: true }).waitFor()
    await panel.getByText('Not recorded', { exact: true }).waitFor()
    assert.deepEqual(edits[1], { p_ticket_id: testTicketId, p_deal_value: null, p_currency: 'USD' })
    assert.deepEqual(editable.pageErrors, [])
    assert.deepEqual(editable.unexpectedRequests, [])
  } finally { await editable.context.close() }
}
