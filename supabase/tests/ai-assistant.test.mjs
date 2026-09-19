import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantHandler } from '../functions/ai-assistant/handler.ts';

const ticketId = '12345678-1234-1234-1234-123456789012';
const origin = 'https://app.example.com';
const request = (body, headers = {}) => new Request('https://project.supabase.co/functions/v1/ai-assistant', { method: 'POST', headers: { origin, Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
function fixture(overrides = {}, envOverrides = {}) {
  const calls = [];
  const env = { AI_ASSISTANT_ENABLED: 'true', OPENAI_API_KEY: 'test-key', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'public-key', AI_ALLOWED_ORIGINS: origin, ...envOverrides };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    for (const [suffix, action] of Object.entries(overrides)) if (url.endsWith(suffix)) return action(url, init);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-id' });
    if (url.endsWith('/get_crm_ticket')) return Response.json({ id: ticketId, projectTitle: 'Website', status: 'active', contacts: [{ email: 'private@example.com' }] });
    if (url.endsWith('/claim_ai_assistant_request')) return Response.json(true);
    if (url.endsWith('/list_crm_follow_ups')) return Response.json([]);
    if (url.endsWith('/release_ai_assistant_request')) return Response.json(null);
    if (url.endsWith('/responses')) return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: 'Active website ticket. [S1]', sourceIds: ['S1'], email: null }) }] }] });
    throw new Error('Unexpected request');
  };
  return { calls, handler: createAssistantHandler({ fetch, env: (key) => env[key] }) };
}

test('preflight handles allowed origins without requiring authentication', async () => {
  const { handler, calls } = fixture();
  const response = await handler(new Request('https://project.supabase.co/functions/v1/ai-assistant', { method: 'OPTIONS', headers: { origin } }));
  assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), origin); assert.equal(calls.length, 0);
});
test('rejects unapproved origins and missing or invalid user tokens', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request({ action: 'status' }, { origin: 'https://unapproved.example' }))).status, 403);
  assert.equal((await handler(request({ action: 'status' }, { Authorization: '' }))).status, 401);
  assert.equal(calls.length, 0);
  const invalid = fixture({ '/auth/v1/user': () => Response.json({}, { status: 401 }) });
  assert.equal((await invalid.handler(request({ action: 'status' }))).status, 401);
});
test('missing key or disabled flag keeps status available without model calls', async () => {
  for (const env of [{ OPENAI_API_KEY: '' }, { AI_ASSISTANT_ENABLED: 'false' }]) {
    const { handler, calls } = fixture({}, env);
    const response = await handler(request({ action: 'status' }));
    assert.deepEqual(await response.json(), { available: false });
    assert.equal((await handler(request({ action: 'ask', ticketId, mode: 'summary' }))).status, 503);
    assert.ok(calls.every((call) => call.url.endsWith('/auth/v1/user')));
  }
});
test('authorization failure never reaches quota or model', async () => {
  const { handler, calls } = fixture({ '/get_crm_ticket': () => Response.json({ message: 'Ticket not found or access denied' }, { status: 400 }) });
  assert.equal((await handler(request({ action: 'ask', ticketId, mode: 'summary' }))).status, 403);
  assert.equal(calls.length, 2);
});
test('uses caller credentials, excludes contact data, and releases database lease', async () => {
  const { handler, calls } = fixture();
  const response = await handler(request({ action: 'ask', ticketId, mode: 'summary', context: 'UNTRUSTED_CONTEXT' }));
  assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.sources[0].tab, 'overview'); assert.ok(data.contextAsOf);
  const model = calls.find((call) => call.url.endsWith('/responses'));
  const body = JSON.parse(model.init.body); assert.equal(body.store, false); assert.equal(body.tools, undefined);
  assert.ok(!model.init.body.includes('private@example.com')); assert.ok(!model.init.body.includes('UNTRUSTED_CONTEXT')); assert.ok(!model.init.body.includes('user-jwt'));
  for (const call of calls.filter((call) => call.url.includes('/rest/'))) {
    assert.equal(call.init.headers.Authorization, 'Bearer user-jwt'); assert.equal(call.init.headers.apikey, 'public-key');
  }
  assert.ok(calls.at(-1).url.endsWith('/release_ai_assistant_request'));
});
test('shared quota refusal does not call AI or release another request lease', async () => {
  const { handler, calls } = fixture({ '/claim_ai_assistant_request': () => Response.json(false) });
  assert.equal((await handler(request({ action: 'ask', ticketId, mode: 'summary' }))).status, 429);
  assert.ok(!calls.some((call) => call.url.endsWith('/responses') || call.url.endsWith('/release_ai_assistant_request')));
});
test('provider failure releases the lease and returns a safe error', async () => {
  const { handler, calls } = fixture({ '/responses': () => { throw new Error('private upstream detail'); } });
  const response = await handler(request({ action: 'ask', ticketId, mode: 'summary' }));
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private upstream detail'));
  assert.ok(calls.at(-1).url.endsWith('/release_ai_assistant_request'));
});

test('provider configuration, quota and transient failures have safe actionable messages', async () => {
  for (const [status, code, expected] of [
    [429, 'insufficient_quota', /API quota/],
    [429, 'credit_balance_exhausted', /API credit/],
    [429, 'project_spend_limit_exceeded', /spending limit/],
    [429, 'organization_spend_limit_exceeded', /spending limit/],
    [429, 'organization_usage_limit_exceeded', /usage allowance/],
    [401, 'invalid_api_key', /API key in Supabase/],
    [429, 'rate_limit_exceeded', /wait a moment/],
    [403, 'permission_denied', /model and project permissions/],
    [404, 'model_not_found', /model and project permissions/],
    [400, 'invalid_request_error', /model settings/],
    [500, 'server_error', /temporarily unavailable/],
  ]) {
    const { handler, calls } = fixture({ '/responses': () => Response.json({ error: { code, message: 'private upstream detail' } }, { status }) });
    const response = await handler(request({ action: 'ask', ticketId, mode: 'summary' }));
    assert.equal(response.status, code === 'rate_limit_exceeded' ? 429 : 503);
    const { message } = await response.json();
    assert.match(message, expected);
    assert.ok(!message.includes('private upstream detail'));
    assert.ok(calls.at(-1).url.endsWith('/release_ai_assistant_request'));
  }
});

test('database setup errors are distinguishable and never expose database details', async () => {
  const { handler, calls } = fixture({ '/claim_ai_assistant_request': () => Response.json({ message: 'private SQL detail' }, { status: 400 }) });
  const response = await handler(request({ action: 'ask', ticketId, mode: 'summary' }));
  assert.equal(response.status, 503);
  const { message } = await response.json();
  assert.match(message, /database setup/);
  assert.ok(!message.includes('private SQL detail'));
  assert.ok(!calls.some((call) => call.url.endsWith('/responses')));
});
test('invalid inputs and oversized bodies are rejected before ticket retrieval', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(request({ action: 'ask', ticketId: 'invalid', mode: 'summary' }))).status, 400);
  assert.equal((await handler(request({ action: 'ask', ticketId, mode: 'chat', message: 'x'.repeat(65000) }))).status, 413);
  assert.ok(calls.every((call) => call.url.endsWith('/auth/v1/user')));
});
test('incomplete output and invented citations are refused', async () => {
  const { handler } = fixture({ '/responses': () => Response.json({ status: 'incomplete', output: [] }) });
  assert.equal((await handler(request({ action: 'ask', ticketId, mode: 'summary' }))).status, 503);
});
