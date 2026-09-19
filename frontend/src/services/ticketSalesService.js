import { normalizeTicketSales, SALES_CURRENCIES, ticketSalesErrorMessage, validateDealValue } from '../config/ticketSales.js'
import { supabase } from '../utils/supabase.js'

async function rpc(name, parameters) {
  let result
  try { result = await supabase.rpc(name, parameters) }
  catch (error) { throw new Error(ticketSalesErrorMessage(error)) }
  if (result.error) throw new Error(ticketSalesErrorMessage(result.error))
  return normalizeTicketSales(result.data)
}

export const ticketSalesService = Object.freeze({
  get: (ticketId) => rpc('get_crm_ticket_sales', { p_ticket_id: ticketId }),
  update: (ticketId, { dealValue, currency }) => {
    const parsed = validateDealValue(dealValue)
    if (parsed.error) return Promise.reject(new Error(parsed.error))
    if (!SALES_CURRENCIES.includes(currency)) return Promise.reject(new Error('Select a supported currency.'))
    return rpc('update_crm_ticket_sales', {
      p_ticket_id: ticketId, p_deal_value: parsed.value, p_currency: currency,
    })
  },
})
