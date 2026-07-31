export function Brand({ compact = false }) {
  return (
    <span className="brand" aria-label="LeadSphere">
      <span className="brand-mark" aria-hidden="true">L</span>
      {!compact && <span>LeadSphere</span>}
    </span>
  )
}
