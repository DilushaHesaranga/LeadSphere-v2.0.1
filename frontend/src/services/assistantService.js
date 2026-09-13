import { supabase } from '../utils/supabase.js'
import { invokeAssistant } from './assistantTransport.js'

export const assistantService = {
  status: (signal) => invokeAssistant(supabase, { action: 'status' }, signal),
  ask: (ticketId, input, signal) => invokeAssistant(supabase, { ...input, action: 'ask', ticketId }, signal),
}

