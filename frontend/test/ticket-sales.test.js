import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDealValue, MAX_DEAL_VALUE, normalizeTicketSales, SALES_CURRENCIES, ticketSalesErrorMessage, validateDealValue } from '../src/config/ticketSales.js'

test('optional deal values distinguish missing amounts from zero', () => {
  for (const value of ['', '   ', null, undefined]) assert.deepEqual(validateDealValue(value), { value: null, error: '' })
  for (const value of ['0', '0.00', 0]) assert.deepEqual(validateDealValue(value), { value: 0, error: '' })
  assert.deepEqual(validateDealValue(' 125000.50 '), { value: 125000.5, error: '' })
  assert.deepEqual(validateDealValue('999999999999.99'), { value: MAX_DEAL_VALUE, error: '' })
})

test('amount validation rejects invalid precision, negatives, unsafe amounts and non-decimal notation', () => {
  for (const value of ['-1', '1.001', '1,000', '1e5', '0x10', '1.', '1000000000000', 'Infinity', NaN, Infinity, true, {}, '£30']) {
    assert.ok(validateDealValue(value).error, `Expected validation error for ${String(value)}`)
  }
})

test('currency formatting keeps missing data separate and identifies each currency', () => {
  assert.equal(formatDealValue(null), 'Not recorded')
  assert.equal(formatDealValue(''), 'Not recorded')
  assert.equal(formatDealValue('   '), 'Not recorded')
  assert.match(formatDealValue(0, 'USD'), /^USD\s0\.00$/)
  for (const currency of SALES_CURRENCIES) assert.match(formatDealValue(125000.5, currency), new RegExp(`^${currency}\\s125,000\\.50$`))
  assert.equal(formatDealValue(Infinity, 'LKR'), 'Unavailable')
  assert.equal(formatDealValue(-50, 'LKR'), 'Unavailable')
  assert.equal(formatDealValue(50, 'INVALID'), 'Unavailable')
})

test('sales responses validate monetary data without silently replacing missing amounts with zero', () => {
  assert.deepEqual(normalizeTicketSales({ dealValue: null, currency: 'LKR' }), { dealValue: null, currency: 'LKR' })
  assert.deepEqual(normalizeTicketSales({ dealValue: '42.50', currency: 'EUR' }), { dealValue: 42.5, currency: 'EUR' })
  for (const record of [null, {}, { currency: 'LKR' }, { dealValue: 50, currency: 'XXX' }, { dealValue: -1, currency: 'USD' }]) {
    assert.throws(() => normalizeTicketSales(record), /unavailable/)
  }
})

test('sales service errors explain missing setup and avoid displaying raw server details', () => {
  assert.match(ticketSalesErrorMessage({ code: 'PGRST202' }), /Sales setup is pending/)
  assert.match(ticketSalesErrorMessage({ code: '42883' }), /Sales setup is pending/)
  assert.match(ticketSalesErrorMessage({ code: '42501' }), /permission/)
  assert.match(ticketSalesErrorMessage({ message: 'Ticket archived' }), /no longer available/)
  assert.equal(ticketSalesErrorMessage({ message: 'internal detail' }), 'Recorded deal value is unavailable. Please try again.')
})
