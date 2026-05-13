'use client'

import { useState, useEffect, useCallback } from 'react'

interface Member {
  user_id: string
  role: string
  display_name: string | null
  email: string | null
  is_current_user: boolean
}

interface PendingInvite {
  token: string
  email: string
  role: string
  expires_at: string
}

interface MembersData {
  current_user_role: string
  members: Member[]
  pending_invites: PendingInvite[]
}

interface Props {
  gardenId: string
  googleSheetId: string | null
}

export default function GardenMembersSection({ gardenId, googleSheetId }: Props) {
  const [data, setData] = useState<MembersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'edit' | 'view'>('edit')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSent, setInviteSent] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareResult, setShareResult] = useState<{ ok: boolean; message: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/gardens/${gardenId}/members`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [gardenId])

  useEffect(() => { load() }, [load])

  const isOwner = data?.current_user_role === 'owner'

  async function handleChangeRole(userId: string, newRole: string) {
    await fetch(`/api/gardens/${gardenId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    load()
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this garden?`)) return
    await fetch(`/api/gardens/${gardenId}/members/${userId}`, { method: 'DELETE' })
    load()
  }

  async function handleCancelInvite(token: string, email: string) {
    if (!confirm(`Cancel invite to ${email}?`)) return
    await fetch(`/api/invites/${token}`, { method: 'DELETE' })
    load()
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteError(null)
    setInviteSent(false)

    const res = await fetch(`/api/gardens/${gardenId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    })

    setInviting(false)
    if (res.ok) {
      setInviteSent(true)
      setInviteEmail('')
      setTimeout(() => setInviteSent(false), 5000)
      load()
    } else {
      const d = await res.json()
      setInviteError(d.error ?? 'Could not send invite')
    }
  }

  async function handleShareSheet() {
    setSharing(true)
    setShareResult(null)
    const res = await fetch(`/api/gardens/${gardenId}/share-sheet`, { method: 'POST' })
    const d = await res.json()
    setSharing(false)
    if (res.ok) {
      const msg = d.shared === 0
        ? 'No members to share with yet.'
        : `Shared with ${d.shared} member${d.shared !== 1 ? 's' : ''}.`
      setShareResult({ ok: true, message: msg })
    } else {
      setShareResult({ ok: false, message: d.error ?? 'Could not share sheet.' })
    }
    setTimeout(() => setShareResult(null), 6000)
  }

  if (loading) {
    return (
      <section className="card p-6">
        <h2 className="font-serif text-xl text-soil mb-5">Members</h2>
        <p className="text-sm text-bark/50 font-sans animate-pulse">Loading…</p>
      </section>
    )
  }

  if (!data) return null

  return (
    <section className="card p-6 space-y-6">
      <h2 className="font-serif text-xl text-soil">Members</h2>

      {/* Member list */}
      <div>
        {data.members.map(member => {
          const displayLabel = member.display_name ?? member.email ?? 'Member'
          const showEmail = member.display_name && member.email
          return (
            <div
              key={member.user_id}
              className="flex items-center gap-3 py-2.5 border-b border-sage/15 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-sans text-soil font-medium truncate">
                  {displayLabel}
                  {member.is_current_user && (
                    <span className="text-bark/50 font-normal ml-1">(you)</span>
                  )}
                </p>
                {showEmail && (
                  <p className="text-xs text-bark/55 font-sans truncate">{member.email}</p>
                )}
              </div>

              {/* Role: editable dropdown for owner managing non-owners; badge otherwise */}
              {isOwner && !member.is_current_user && member.role !== 'owner' ? (
                <select
                  value={member.role}
                  onChange={e => handleChangeRole(member.user_id, e.target.value)}
                  className="text-xs font-sans border border-sage/30 rounded-lg px-2 py-1 bg-parchment/60 text-soil"
                >
                  <option value="edit">Editor</option>
                  <option value="view">Viewer</option>
                </select>
              ) : (
                <span className={`text-xs font-sans font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
                  member.role === 'owner'
                    ? 'bg-moss/10 text-moss border border-moss/20'
                    : 'bg-sage/15 text-bark border border-sage/20'
                }`}>
                  {member.role === 'owner' ? 'Owner' : member.role === 'edit' ? 'Editor' : 'Viewer'}
                </span>
              )}

              {/* Remove button — owner can remove any non-owner (not themselves) */}
              {isOwner && !member.is_current_user && member.role !== 'owner' && (
                <button
                  onClick={() => handleRemove(member.user_id, displayLabel)}
                  className="text-xs font-sans text-harvest/70 hover:text-harvest border border-harvest/20 hover:border-harvest/40 rounded-lg px-2.5 py-1 transition-colors whitespace-nowrap"
                >
                  Remove
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Pending invites — owner only */}
      {isOwner && data.pending_invites.length > 0 && (
        <div>
          <h3 className="text-xs font-sans font-medium text-bark/55 uppercase tracking-wide mb-2">
            Pending invites
          </h3>
          {data.pending_invites.map(inv => (
            <div
              key={inv.token}
              className="flex items-center gap-3 py-2.5 border-b border-sage/15 last:border-0"
            >
              <p className="text-sm font-sans text-soil flex-1 truncate">{inv.email}</p>
              <span className="text-xs font-sans text-bark/60 bg-sage/10 border border-sage/20 rounded-full px-2.5 py-1 whitespace-nowrap">
                {inv.role === 'edit' ? 'Editor' : 'Viewer'}
              </span>
              <button
                onClick={() => handleCancelInvite(inv.token, inv.email)}
                className="text-xs font-sans text-harvest/70 hover:text-harvest border border-harvest/20 hover:border-harvest/40 rounded-lg px-2.5 py-1 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Invite form — owner only */}
      {isOwner && (
        <div>
          <h3 className="text-xs font-sans font-medium text-bark/55 uppercase tracking-wide mb-3">
            Invite someone
          </h3>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                required
                className="input flex-1"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'edit' | 'view')}
                className="text-sm font-sans border border-sage/30 rounded-xl px-3 py-2.5 bg-parchment/60 text-soil"
              >
                <option value="edit">Editor</option>
                <option value="view">Viewer</option>
              </select>
            </div>
            <button type="submit" disabled={inviting} className="btn-primary disabled:opacity-50">
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
            {inviteSent && (
              <p className="text-xs text-moss font-sans">✓ Invite sent</p>
            )}
            {inviteError && (
              <p className="text-xs text-harvest font-sans">{inviteError}</p>
            )}
          </form>
        </div>
      )}

      {/* Share spreadsheet button — owner only, only when a sheet is linked */}
      {isOwner && googleSheetId && (
        <div className="border-t border-sage/20 pt-5">
          <h3 className="text-xs font-sans font-medium text-bark/55 uppercase tracking-wide mb-1.5">
            Google Spreadsheet access
          </h3>
          <p className="text-xs text-bark/55 font-sans mb-3">
            Grant all current members direct access to view or edit the linked spreadsheet in Google Sheets.
          </p>
          <button
            onClick={handleShareSheet}
            disabled={sharing}
            className="btn-ghost disabled:opacity-50"
          >
            {sharing ? 'Sharing…' : 'Share spreadsheet with members'}
          </button>
          {shareResult && (
            <p className={`text-xs font-sans mt-2 ${shareResult.ok ? 'text-moss' : 'text-harvest'}`}>
              {shareResult.ok ? '✓ ' : '⚠ '}{shareResult.message}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
