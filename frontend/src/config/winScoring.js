// Categorical Naive Bayes with Laplace smoothing. Trained only on the caller's
// historical outcomes; no external AI service, persisted model, or shared cache.
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
export function scoreFeatures(ticket) {
  const age = Math.max(0, number(ticket.ageDays))
  const interactions = Math.max(0, number(ticket.interactions))
  const amount = ticket.dealValue == null ? null : number(ticket.dealValue)
  return [age <= 14 ? 'new' : age <= 30 ? 'month' : age <= 90 ? 'quarter' : 'older',
    interactions === 0 ? 'none' : interactions <= 2 ? 'some' : 'many',
    amount == null ? 'unknown' : `${ticket.currency}:${amount === 0 ? 'zero' : Math.floor(Math.log10(Math.max(1, amount)))}`]
}

export function scoreTickets(tickets = [], history = []) {
  const training = history.filter((row) => ['won', 'lost'].includes(row.outcome))
  const wins = training.filter((row) => row.outcome === 'won')
  const losses = training.filter((row) => row.outcome === 'lost')
  const trained = training.length >= 20 && wins.length >= 5 && losses.length >= 5
  const rows = training.map((row) => ({ outcome: row.outcome, features: scoreFeatures(row) }))
  const vocab = [0, 1, 2].map((index) => new Set(rows.map((row) => row.features[index])).size + 1)
  const scored = tickets.map((ticket) => {
    let probability
    if (trained) {
      const features = scoreFeatures(ticket)
      const likelihood = (outcome, count) => Math.log((count + 1) / (training.length + 2)) + features.reduce((sum, feature, index) => {
        const matches = rows.filter((row) => row.outcome === outcome && row.features[index] === feature).length
        return sum + Math.log((matches + 1) / (count + vocab[index]))
      }, 0)
      const win = likelihood('won', wins.length)
      const lost = likelihood('lost', losses.length)
      probability = 100 / (1 + Math.exp(clamp(lost - win, -30, 30)))
    } else {
      // Explicit provisional estimate, not a trained prediction. Missing deal
      // values are excluded from money totals, never treated as zero revenue.
      const baseline = ticket.stageProbability == null ? 30 : number(ticket.stageProbability)
      probability = baseline + Math.min(10, number(ticket.interactions) * 2) - Math.min(15, Math.floor(number(ticket.ageDays) / 30) * 3)
    }
    const winProbability = Math.round(clamp(probability, 5, 95))
    return { ...ticket, winProbability, expectedValue: ticket.dealValue == null ? null : number(ticket.dealValue) * winProbability / 100 }
  }).sort((a, b) => b.winProbability - a.winProbability || number(b.overdueFollowUps) - number(a.overdueFollowUps) || String(a.id).localeCompare(String(b.id)))
  return { tickets: scored, model: { trained, samples: training.length, wins: wins.length, losses: losses.length, name: trained ? 'Naive Bayes · experimental' : 'Provisional stage-based estimate' } }
}

export function expectedRevenue(tickets) {
  const totals = new Map()
  let missing = 0
  for (const ticket of tickets) {
    if (ticket.dealValue == null || !ticket.currency) { missing++; continue }
    const total = totals.get(ticket.currency) ?? { currency: ticket.currency, value: 0, expected: 0, count: 0 }
    total.value += number(ticket.dealValue)
    total.expected += number(ticket.expectedValue)
    total.count++
    totals.set(ticket.currency, total)
  }
  return { totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)), missing }
}
