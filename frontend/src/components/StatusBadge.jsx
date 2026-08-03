export function StatusBadge({ value, kind = 'status' }) {
  const label = value?.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()) ?? 'Unknown'
  return <span className={`crm-badge ${kind}-${value?.toLowerCase() ?? 'unknown'}`}><i aria-hidden="true" />{label}</span>
}
