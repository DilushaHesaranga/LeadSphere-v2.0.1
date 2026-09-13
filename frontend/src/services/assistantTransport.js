export async function invokeAssistant(client, body, signal) {
  const { data: sessionData } = await client.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')
  const { data, error } = await client.functions.invoke('ai-assistant', {
    body, signal, headers: { Authorization: `Bearer ${token}` },
  })
  if (error) {
    let message = 'AI Assistant is temporarily unavailable. You can continue using all CRM features.'
    if (error.context instanceof Response) {
      const payload = await error.context.json().catch(() => ({}))
      if (typeof payload.message === 'string') message = payload.message
    }
    throw new Error(message)
  }
  return data
}
