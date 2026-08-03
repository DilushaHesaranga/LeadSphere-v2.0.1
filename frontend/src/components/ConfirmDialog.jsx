import { ModalShell } from './ModalShell.jsx'

export function ConfirmDialog({ title, children, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onClose }) {
  return (
    <ModalShell title={title} kicker="Confirmation required" onClose={onClose}>
      <div className="confirm-copy">{children}</div>
      <div className="modal-actions">
        <button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={`button ${danger ? 'button-danger' : 'button-primary'}`} type="button" onClick={onConfirm} disabled={busy}>
          {busy ? 'Working...' : confirmLabel}
        </button>
      </div>
    </ModalShell>
  )
}
