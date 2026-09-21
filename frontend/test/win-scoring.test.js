import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreTickets, expectedRevenue, scoreFeatures } from '../src/config/winScoring.js'

test('small or single-class history uses an explicitly provisional score', () => {
  for (const history of [[],Array.from({length:25},()=>({outcome:'won'}))]) {
    const result=scoreTickets([{id:'a',stageProbability:100,ageDays:0,interactions:100,dealValue:null}],history)
    assert.equal(result.model.trained,false)
    assert.equal(result.tickets[0].winProbability,95)
    assert.equal(result.tickets[0].expectedValue,null)
  }
})
test('trained classifier learns outcome evidence and stays bounded on unseen features', () => {
  const history=[...Array.from({length:15},()=>({outcome:'won',ageDays:10,interactions:5,dealValue:1000,currency:'USD'})),...Array.from({length:15},()=>({outcome:'lost',ageDays:150,interactions:0,dealValue:100000,currency:'USD'}))]
  const result=scoreTickets([{...history[0],id:'likely'},{...history[20],id:'unlikely'},{id:'unseen',ageDays:25,interactions:2,dealValue:1,currency:'LKR'}],history)
  assert.equal(result.model.trained,true)
  assert.equal(result.tickets[0].id,'likely')
  assert.equal(result.tickets.at(-1).id,'unlikely')
  for(const ticket of result.tickets) assert.ok(Number.isFinite(ticket.winProbability)&&ticket.winProbability>=5&&ticket.winProbability<=95)
  assert.notEqual(scoreFeatures({dealValue:1000,currency:'LKR'})[2],scoreFeatures({dealValue:1000,currency:'USD'})[2])
})
test('money totals separate currencies and distinguish missing amounts from recorded zero', () => {
  const {tickets}=scoreTickets([{id:'a',stageProbability:50,dealValue:1000,currency:'USD'},{id:'b',stageProbability:50,dealValue:1000,currency:'LKR'},{id:'c',stageProbability:50,dealValue:0,currency:'USD'},{id:'d',dealValue:null}])
  const totals=expectedRevenue(tickets)
  assert.equal(totals.missing,1)
  assert.deepEqual(totals.totals,[{currency:'LKR',value:1000,expected:500,count:1},{currency:'USD',value:1000,expected:500,count:2}])
})
test('priority sorts by probability then overdue follow-ups, without mixing currency amounts', () => {
  const {tickets}=scoreTickets([{id:'b',stageProbability:50,overdueFollowUps:1},{id:'a',stageProbability:50,overdueFollowUps:2},{id:'c',stageProbability:70}])
  assert.deepEqual(tickets.map((ticket)=>ticket.id),['c','a','b'])
})
