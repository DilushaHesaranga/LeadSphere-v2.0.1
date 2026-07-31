import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS, ROLES } from '../auth/permissions.js'
import { Icon } from '../components/Icons.jsx'
import { validateInvitation } from '../utils/access.js'
import { apiRequest } from '../utils/api.js'

function InviteModal({ roles, onClose, onInvited }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const emailRef = useRef(null)

  useEffect(() => {
    emailRef.current?.focus()
    const closeOnEscape = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    const validationError = validateInvitation(email, role)
    if (validationError) return setError(validationError)
    setLoading(true)
    try {
      const result = await apiRequest('/team/invitations', {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      })
      onInvited(result.message)
    } catch (requestError) {
      setError(requestError.message)
      setLoading(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
        <div className="modal-header">
          <div>
            <span className="section-kicker">Team access</span>
            <h2 id="invite-title">Invite a member</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close invitation form">
            <Icon name="close" />
          </button>
        </div>
        <p>The selected business role is authoritative and cannot be changed by the recipient.</p>
        <form onSubmit={submit} noValidate>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <label className="field">
            <span>Email address</span>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
            />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="">Select a role</option>
              {roles.map((item) => (
                <option key={item.slug} value={item.slug}>{item.name}</option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
            <button className="button button-primary" disabled={loading}>
              {loading ? 'Sending invitation...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function TeamManagementPage() {
  const { can } = useAuth()
  const [data, setData] = useState({ members: [], invitations: [] })
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [rolesLoading, setRolesLoading] = useState(true)
  const [error, setError] = useState('')
  const [rolesError, setRolesError] = useState('')
  const [success, setSuccess] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [updatingUser, setUpdatingUser] = useState('')

  const mayInvite = can(PERMISSIONS.TEAM_MEMBERS_INVITE)
  const mayAssignRole = can(PERMISSIONS.TEAM_MEMBERS_ASSIGN_ROLE)
  const mayChangeStatus = can(PERMISSIONS.TEAM_MEMBERS_CHANGE_STATUS)

  const loadTeam = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await apiRequest('/team'))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRoles = useCallback(async () => {
    if (!mayInvite && !mayAssignRole) {
      setRolesLoading(false)
      return
    }
    setRolesLoading(true)
    setRolesError('')
    try {
      setRoles(await apiRequest('/team/roles'))
    } catch (requestError) {
      setRolesError(requestError.message)
    } finally {
      setRolesLoading(false)
    }
  }, [mayAssignRole, mayInvite])

  useEffect(() => {
    loadTeam()
    loadRoles()
  }, [loadRoles, loadTeam])

  const invited = async (message) => {
    setModalOpen(false)
    setSuccess(message)
    await loadTeam()
  }

  const updateMember = async (member, path, body) => {
    setUpdatingUser(member.id)
    setError('')
    setSuccess('')
    try {
      const result = await apiRequest(`/team/members/${member.id}/${path}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      setSuccess(result.message)
      await loadTeam()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingUser('')
    }
  }

  return (
    <div className="console-content">
      <div className="page-heading team-heading">
        <div>
          <span className="section-kicker">System administration</span>
          <h1>Team Management</h1>
          <p>Manage business-role access and send role-bound invitations.</p>
        </div>
        {mayInvite && (
          <button
            className="button button-primary"
            onClick={() => setModalOpen(true)}
            disabled={loading || rolesLoading || Boolean(rolesError)}
          >
            <Icon name="plus" size={18} />
            {rolesLoading ? 'Loading roles...' : 'Invite Member'}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {rolesError && (
        <div className="alert alert-error" role="alert">
          Assignable roles could not be loaded: {rolesError}
          <button className="text-button" onClick={loadRoles}>Retry</button>
        </div>
      )}
      {success && <div className="alert alert-success" role="status">{success}</div>}

      {loading ? (
        <div className="loading-state panel-loading">Loading team access...</div>
      ) : (
        <div className="team-grid">
          <section className="data-panel">
            <div className="panel-heading">
              <div>
                <h2>Team members</h2>
                <p>{data.members.filter((member) => member.membershipStatus === 'active').length} active</p>
              </div>
            </div>
            {data.members.length ? (
              <div className="member-list">
                {data.members.map((member) => {
                  const protectedAdmin = member.role === ROLES.SYSTEM_ADMIN
                  const busy = updatingUser === member.id
                  return (
                    <article className="member-row" key={member.id}>
                      <span className="avatar">{(member.displayName || member.email)[0].toUpperCase()}</span>
                      <div className="member-identity">
                        <strong>{member.displayName || 'Name pending'}</strong>
                        <span>{member.email}</span>
                      </div>
                      {mayAssignRole && !protectedAdmin ? (
                        <select
                          className="role-select"
                          aria-label={`Role for ${member.email}`}
                          value={member.role}
                          disabled={busy || rolesLoading}
                          onChange={(event) => updateMember(member, 'role', { role: event.target.value })}
                        >
                          {roles.map((role) => (
                            <option key={role.slug} value={role.slug}>{role.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="role-badge">{member.roleName}</span>
                      )}
                      {mayChangeStatus && !protectedAdmin ? (
                        <button
                          className={`membership-action ${member.membershipStatus}`}
                          disabled={busy}
                          onClick={() => updateMember(member, 'status', {
                            status: member.membershipStatus === 'active' ? 'disabled' : 'active',
                          })}
                        >
                          {member.membershipStatus === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      ) : (
                        <span className={member.membershipStatus === 'active' ? 'status-pill' : 'pending-pill'}>
                          {member.membershipStatus}
                        </span>
                      )}
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="panel-empty">No team memberships have been assigned yet.</div>
            )}
          </section>

          <section className="data-panel">
            <div className="panel-heading">
              <div>
                <h2>Pending invitations</h2>
                <p>{data.invitations.length} waiting</p>
              </div>
            </div>
            {data.invitations.length ? (
              <div className="member-list">
                {data.invitations.map((invitation) => (
                  <article className="member-row invite-row" key={invitation.id}>
                    <span className="avatar muted"><Icon name="mail" size={18} /></span>
                    <div className="member-identity">
                      <strong>{invitation.email}</strong>
                      <span>Expires {new Date(invitation.expiresAt).toLocaleString()}</span>
                    </div>
                    <span className="role-badge">{invitation.roleName}</span>
                    <span className="pending-pill">Pending</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="panel-empty">There are no pending invitations.</div>
            )}
          </section>
        </div>
      )}

      {modalOpen && (
        <InviteModal
          roles={roles}
          onClose={() => setModalOpen(false)}
          onInvited={invited}
        />
      )}
    </div>
  )
}
