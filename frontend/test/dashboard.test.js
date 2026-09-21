import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dashboardCount, dashboardErrorMessage, dashboardMoney, dashboardParameters, dashboardRange,
  dashboardRangeError, dashboardSalesMonths, dashboardSalesValue, defaultDashboardFilters,
  parseDashboardFilters, parseSalesPerformanceFilters, defaultSalesPerformanceFilters, refreshDashboardFilters, serializeDashboardFilters,
} from '../src/config/dashboard.js'

test('sales opens across the month boundary while preserving explicit dates and scope', () => {
  const today = '2026-09-20'
  const filters = parseSalesPerformanceFilters('?department=sales', today)
  assert.equal(filters.from, '2026-08-22')
  assert.equal(filters.to, today)
  assert.equal(filters.department, 'sales')
  assert.equal(defaultSalesPerformanceFilters(today).preset, '30')
  assert.equal(parseSalesPerformanceFilters('?period=month', today).from, '2026-09-01')
  const custom = parseSalesPerformanceFilters('?period=custom&from=2026-08-01&to=2026-08-31&owner=example', today)
  assert.equal(custom.from, '2026-08-01')
  assert.equal(custom.to, '2026-08-31')
  assert.equal(custom.ownerId, 'example')
  assert.equal(defaultDashboardFilters(today).preset, 'month')
})

test('dashboard periods are inclusive and use the supplied local day', () => {
  assert.deepEqual(dashboardRange('month', '2026-09-17'), { from: '2026-09-01', to: '2026-09-17' })
  assert.deepEqual(dashboardRange('30', '2024-03-01'), { from: '2024-02-01', to: '2024-03-01' })
})

test('refresh rolls relative periods into the current day and month while preserving scope', () => {
  const filters = { ...defaultDashboardFilters('2026-09-30'), pipelineId: 'p1', ownerId: 'u1', department: 'sales' }
  assert.deepEqual(refreshDashboardFilters(filters, '2026-10-01'), {
    ...filters, from: '2026-10-01', to: '2026-10-01',
  })
  for (const preset of ['30', '90', '365']) {
    const rolling = { ...filters, preset, ...dashboardRange(preset, '2026-09-30') }
    const next = refreshDashboardFilters(rolling, '2026-10-01')
    assert.deepEqual(next, { ...rolling, ...dashboardRange(preset, '2026-10-01') })
    assert.equal((new Date(next.to) - new Date(next.from)) / 86_400_000 + 1, Number(preset))
  }
})

test('refresh preserves custom dates and unchanged filters without triggering a filter reset', () => {
  const current = defaultDashboardFilters('2026-09-30')
  assert.equal(refreshDashboardFilters(current, '2026-09-30'), current)
  const custom = { ...current, preset: 'custom', from: '2026-01-01', to: '2026-04-30' }
  assert.equal(refreshDashboardFilters(custom, '2026-10-01'), custom)
})

test('custom dates reject impossible dates, reversed dates, future dates and excessive spans', () => {
  assert.ok(dashboardRangeError('2026-02-30', '2026-03-01', '2026-09-17'))
  assert.ok(dashboardRangeError('', '2026-09-17', '2026-09-17'))
  assert.ok(dashboardRangeError('2026-09-17', '2026-09-16', '2026-09-17'))
  assert.ok(dashboardRangeError('2026-09-17', '2026-09-18', '2026-09-17'))
  assert.ok(dashboardRangeError('2020-01-01', '2026-09-17', '2026-09-17'))
  assert.equal(dashboardRangeError('2024-02-29', '2024-03-01', '2026-09-17'), '')
})

test('filter URLs preserve custom ranges and refresh relative ranges on a later day', () => {
  const custom = { preset: 'custom', from: '2026-08-01', to: '2026-08-15', pipelineId: 'p1', ownerId: 'u1', department: 'sales' }
  assert.deepEqual(parseDashboardFilters(serializeDashboardFilters(custom), '2026-09-17'), custom)
  assert.equal(parseDashboardFilters('?period=month&from=2026-08-01', '2026-09-17').from, '2026-09-01')
  assert.deepEqual(parseDashboardFilters('?period=custom&from=bad&to=bad&department=invalid', '2026-09-17'), defaultDashboardFilters('2026-09-17'))
})

test('summary and drill-down parameters preserve all applied scope filters', () => {
  assert.deepEqual(dashboardParameters({ from: '2026-09-01', to: '2026-09-17', pipelineId: 'p', ownerId: 'u', department: 'delivery' }), {
    p_from: '2026-09-01', p_to: '2026-09-17', p_pipeline_id: 'p', p_owner_id: 'u', p_department: 'delivery',
  })
  assert.equal(dashboardParameters(defaultDashboardFilters('2026-09-17')).p_owner_id, null)
})

test('sales chart separates currencies, fills gaps, and preserves unknown value coverage', () => {
  const series = [
    { month: '2026-07-01', currency: 'LKR', wonValue: 1200, wonCount: 2, withValue: 1, missingValue: 1 },
    { month: '2026-07-01', currency: 'USD', wonValue: 70, wonCount: 1, withValue: 1, missingValue: 0 },
    { month: '2026-09-01', currency: 'LKR', wonValue: 0, wonCount: 1, withValue: 1, missingValue: 0 },
  ]
  const months = dashboardSalesMonths(series, 'LKR', '2026-07-10', '2026-09-17')
  assert.equal(months.length, 3)
  assert.deepEqual(months.map((row) => row.wonValue), [1200, 0, 0])
  assert.equal(months[0].missingValue, 1)
  assert.equal(months[1].wonCount, 0)
  assert.equal(months[2].withValue, 1)
  assert.deepEqual(dashboardSalesMonths(series, 'LKR', 'bad', 'bad'), [])
})

test('missing metrics and failed queries never appear as a zero total or leak raw errors', () => {
  assert.equal(dashboardCount(null), '—')
  assert.equal(dashboardCount(0), '0')
  assert.match(dashboardErrorMessage({ code: 'PGRST202' }), /database update/)
  assert.match(dashboardErrorMessage({ message: 'Permission denied' }), /role/)
  assert.equal(dashboardErrorMessage({ message: 'private SQL detail' }).includes('private SQL detail'), false)
})

test('sales totals may exceed a single ticket limit while unknown and zero stay distinct', () => {
  assert.equal(dashboardMoney(null, 'LKR'), 'Not recorded')
  assert.equal(dashboardMoney(0, 'USD'), 'USD\u00a00.00')
  assert.match(dashboardMoney(1999999999999.98, 'LKR'), /1,999,999,999,999\.98/)
  assert.equal(dashboardMoney(NaN, 'LKR'), 'Unavailable')
})

test('selected-currency sales distinguish unused currencies, missing values and recorded zero', () => {
  const unused = { currency: 'EUR', wonWithValue: 0, wonMissingValue: 0, wonValue: null, pipelineWithValue: 0, pipelineMissingValue: 0, pipelineValue: null }
  assert.equal(dashboardSalesValue(unused, 'EUR', 'won'), 'No EUR value')
  assert.equal(dashboardSalesValue(unused, 'EUR', 'pipeline'), 'No EUR value')
  assert.equal(dashboardSalesValue(undefined, 'GBP', 'won'), 'No GBP value')
  assert.equal(dashboardSalesValue({ ...unused, wonMissingValue: 1 }, 'EUR', 'won'), 'Not recorded')
  assert.equal(dashboardSalesValue({ ...unused, pipelineMissingValue: 1 }, 'EUR', 'pipeline'), 'Not recorded')
  assert.equal(dashboardSalesValue({ ...unused, wonWithValue: 1, wonValue: 0 }, 'EUR', 'won'), 'EUR\u00a00.00')
  assert.equal(dashboardSalesValue({ ...unused, pipelineWithValue: 1, pipelineValue: 500 }, 'EUR', 'pipeline'), 'EUR\u00a0500.00')
})
