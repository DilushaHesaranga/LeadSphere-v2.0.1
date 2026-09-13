import test from 'node:test'
import assert from 'node:assert/strict'
import { invokeAssistant } from '../src/services/assistantTransport.js'

test('assistant invokes Supabase with the signed-in user and cancellation signal', async () => {
  const signal = new AbortController().signal
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) },
    functions: { invoke: async (name, options) => {
      assert.equal(name, 'ai-assistant')
      assert.equal(options.headers.Authorization, 'Bearer test-session')
      assert.equal(options.signal, signal)
      assert.deepEqual(options.body, { action: 'status' })
      return { data: { available: true }, error: null }
    } },
  }
  assert.deepEqual(await invokeAssistant(client, { action: 'status' }, signal), { available: true })
})
test('assistant requires a session before invoking any function', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: null } }) } }
  await assert.rejects(invokeAssistant(client, {}), /session has expired/)
})
test('assistant preserves safe endpoint errors and handles network failures', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) }, functions: {
    invoke: async () => ({ error: { context: Response.json({ message: 'Ticket not found or access denied.' }, { status: 403 }) } }),
  } }
  await assert.rejects(invokeAssistant(client, {}), /access denied/)
  client.functions.invoke = async () => ({ error: new Error('raw transport details') })
  await assert.rejects(invokeAssistant(client, {}), /temporarily unavailable/)
})
