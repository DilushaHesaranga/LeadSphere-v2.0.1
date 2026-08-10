export const CASE_LIFECYCLES = Object.freeze([
  ['prospect', 'Prospect'], ['lead', 'Lead'], ['qualified', 'Qualified'], ['customer', 'Customer'],
  ['active_customer', 'Active Customer'], ['inactive_customer', 'Inactive Customer'], ['lost', 'Lost'], ['archived', 'Archived'],
])

export const CASE_STATUSES = Object.freeze([
  ['active', 'Active'], ['inactive', 'Inactive'], ['customer', 'Customer'], ['at_risk', 'At Risk'], ['closed', 'Closed'],
])

export const CASE_PRIORITIES = Object.freeze([['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['critical', 'Critical']])

export function calculateRate(numerator, otherOutcome) {
  const first = Number(numerator) || 0
  const second = Number(otherOutcome) || 0
  const eligible = first + second
  return eligible ? Math.round((first / eligible) * 1000) / 10 : null
}

export const calculateAcceptanceRate = (accepted, rejected) => calculateRate(accepted, rejected)
export const calculateWinRate = (won, lost) => calculateRate(won, lost)

export function formatRate(value) {
  return value === null || value === undefined || Number.isNaN(Number(value)) ? 'N/A' : `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}%`
}

export function rankCaseEmployees(employees = []) {
  const sufficientDataExists = employees.some((employee) => (Number(employee.won) || 0) + (Number(employee.lost) || 0) >= 3)
  return employees.map((employee) => {
    const handled = Number(employee.ticketsHandled) || 0
    const won = Number(employee.won) || 0
    const lost = Number(employee.lost) || 0
    const winRate = calculateWinRate(won, lost)
    const acceptanceRate = calculateAcceptanceRate(employee.accepted, employee.rejected)
    const qualified = !sufficientDataExists || won + lost >= 3
    const score = (winRate ?? 0) * 0.55 + (acceptanceRate ?? 0) * 0.2 + Math.min(won, 10) * 2 + Math.min(handled, 20) * 0.5
    return { ...employee, winRate, acceptanceRate, qualified, score: Math.round(score * 10) / 10 }
  }).sort((a, b) => Number(b.qualified) - Number(a.qualified) || b.score - a.score || Number(b.won) - Number(a.won))
}

export function caseHealthHelp(health) {
  if (health === 'AT_RISK') return 'At Risk: the Case has been explicitly marked high risk.'
  if (health === 'ATTENTION_NEEDED') return 'Attention Needed: an overdue Follow Up or 60 days without interaction was detected.'
  return 'Healthy: no overdue Follow Ups, high-risk flag, or extended inactivity was detected.'
}
