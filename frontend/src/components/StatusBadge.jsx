import { ticketStage } from '../config/crm.js'

export function StatusBadge({ value, kind = 'status' }) {
  const label = (kind === 'stage' ? ticketStage(value)?.name : null) ?? value?.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()) ?? 'Unknown'
  return <span className={`crm-badge ${kind}-${value?.toLowerCase() ?? 'unknown'}`}><i aria-hidden="true" />{label}</span>
}
