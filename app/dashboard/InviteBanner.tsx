'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Invite {
  token: string
  role: string
  gardenId: string
  gardenName: string
  inviterName: string
}

export default function InviteBanner({ invites }: { invites: Invite[] }) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<string | null>(null)

  const visible = invites.filter(i => !dismissed.has(i.token))
  if (visible.length === 0) return null

  async function handleAccept(invite: Invite) {
    setLoading(invite.token)
    const res = await fetch(`/api/invites/${invite.token}/accept`, { method: 'POST' })
    const data = await res.json()
    setLoading(null)
    if (res.ok) {
      router.push(`/garden/${data.garden_id}`)
      router.refresh()
    }
  }

  function handleDismiss(token: string) {
    setDismissed(prev => new Set([...prev, token]))
  }

  return (
    <div className="space-y-2 mb-6">
      {visible.map(invite => (
        <div
          key={invite.token}
          className="bg-moss/8 border border-moss/25 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap"
        >
          <p className="text-sm font-sans text-soil flex-1 min-w-0">
            <strong>{invite.inviterName}</strong> invited you to join{' '}
            <strong>{invite.gardenName}</strong>
            {' '}as a <span className="text-moss">{invite.role === 'edit' ? 'editor' : 'viewer'}</span>.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => handleAccept(invite)}
              disabled={loading === invite.token}
              className="text-xs font-sans font-medium text-parchment bg-moss hover:bg-moss/90
                         rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              {loading === invite.token ? 'Joining…' : 'Accept'}
            </button>
            <button
              onClick={() => handleDismiss(invite.token)}
              className="text-xs font-sans text-bark/60 hover:text-soil transition-colors px-2 py-1.5"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
