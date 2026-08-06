export const FOLLOW_UP_TYPES = Object.freeze([
  { value: 'EMAIL', label: 'Email' },
  { value: 'CALL', label: 'Call' },
  { value: 'MEETING', label: 'Meeting' },
])

export const FOLLOW_UP_FREQUENCIES = Object.freeze([
  { value: 'DAILY', label: 'Daily' },
  { value: 'EVERY_3_DAYS', label: 'Every 3 days' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
])

export const FOLLOW_UP_STATUSES = Object.freeze(['PENDING', 'COMPLETED', 'CANCELLED'])

export function followUpFrequencyLabel(value) {
  return FOLLOW_UP_FREQUENCIES.find((item) => item.value === value)?.label ?? 'One-time'
}

export function toDateTimeLocalValue(value) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function localDateTimeToIso(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function createFollowUpRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

export function calculateNextOccurrence(previous, frequency) {
  const date = new Date(previous)
  if (Number.isNaN(date.getTime())) return null
  if (frequency === 'DAILY') date.setUTCDate(date.getUTCDate() + 1)
  else if (frequency === 'EVERY_3_DAYS') date.setUTCDate(date.getUTCDate() + 3)
  else if (frequency === 'WEEKLY') date.setUTCDate(date.getUTCDate() + 7)
  else if (frequency === 'MONTHLY') {
    const day = date.getUTCDate()
    const targetYear = date.getUTCMonth() === 11 ? date.getUTCFullYear() + 1 : date.getUTCFullYear()
    const targetMonth = (date.getUTCMonth() + 1) % 12
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
    date.setUTCFullYear(targetYear, targetMonth, Math.min(day, lastDay))
  } else return null
  return date.toISOString()
}

export function validateFollowUp(input, { requireTicket = false, now = Date.now() } = {}) {
  const errors = {}
  if (requireTicket && !input.ticketId) errors.ticketId = 'Select a Ticket.'
  const scheduledAt = new Date(input.scheduledAt)
  if (!input.scheduledAt || Number.isNaN(scheduledAt.getTime())) errors.scheduledAt = 'Select a valid follow-up date and time.'
  else if (scheduledAt.getTime() <= now) errors.scheduledAt = 'Follow-up date and time must be in the future.'
  if (!FOLLOW_UP_TYPES.some((item) => item.value === input.type)) errors.type = 'Select a follow-up type.'
  if ((input.purpose?.trim().length ?? 0) > 1000) errors.purpose = 'Purpose must be 1000 characters or fewer.'
  if (input.recurring && !FOLLOW_UP_FREQUENCIES.some((item) => item.value === input.frequency)) errors.frequency = 'Select a recurrence frequency.'
  if (!input.recurring && input.frequency) errors.frequency = 'Recurrence frequency is only available for recurring Follow Ups.'
  return errors
}
