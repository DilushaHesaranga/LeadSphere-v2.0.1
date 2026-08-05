import { useMemo, useState } from 'react'
import { Icon } from './Icons.jsx'
import { ModalShell } from './ModalShell.jsx'

export function AssigneeManagerDialog({ users, assignedUserIds, busy, onClose, onAdd }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])
  const available = useMemo(() => {
    const query = search.trim().toLowerCase()
    return users.filter((user) => !assignedUserIds.includes(user.id) && (!query || user.name.toLowerCase().includes(query)))
  }, [assignedUserIds, search, users])
  const toggle = (userId) => setSelected((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId])

  return <ModalShell title="Add assigned members" kicker="Ticket assignments" onClose={onClose}>
    <label className="field assignee-search"><span>Search users</span><div><Icon name="search" size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name"/></div></label>
    <div className="assignee-search-results" role="listbox" aria-label="Available users" aria-multiselectable="true">
      {available.map((user) => <button key={user.id} type="button" role="option" aria-selected={selected.includes(user.id)} className={selected.includes(user.id) ? 'selected' : ''} onClick={() => toggle(user.id)}><span className="avatar">{user.name[0]?.toUpperCase()}</span><span>{user.name}</span><Icon name={selected.includes(user.id) ? 'check' : 'plus'} size={17}/></button>)}
      {!available.length && <div className="compact-empty">{search ? 'No users match your search.' : 'Every available user is already assigned.'}</div>}
    </div>
    <div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" type="button" onClick={() => onAdd(selected)} disabled={busy || !selected.length}>{busy ? 'Adding...' : `Add selected${selected.length ? ` (${selected.length})` : ''}`}</button></div>
  </ModalShell>
}
