'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  token: string
  gardenId: string
  alreadyMember: boolean
}

export default function InviteActions({ token, gardenId, alreadyMember }: Props) {
  const router = useRouter()
  const [accepting, setAccepting] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (alreadyMember) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-sans text-moss bg-moss/8 border border-moss/20 rounded-xl px-4 py-3">
          You&apos;re already a member of this garden.
        </p>
        <button onClick={() => router.push(`/garden/${gardenId}`)} className="btn-primary w-full">
          Open garden →
        </button>
      </div>
    )
  }

  async function handleAccept() {
    setAccepting(true)
    setError(null)

    const res = await fetch(`/api/invites/${token}/accept`, { method: 'POST' })
    const data = await res.json()
    setAccepting(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong — please try again.')
      return
    }

    router.push(`/garden/${data.garden_id}`)
  }

  async function handleDecline() {
    setDeclining(true)
    await fetch(`/api/invites/${token}`, { method: 'DELETE' })
    setDeclining(false)
    router.push('/dashboard')
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans">
          {error}
        </p>
      )}
      <button
        onClick={handleAccept}
        disabled={accepting || declining}
        className="btn-primary w-full disabled:opacity-50"
      >
        {accepting ? 'Joining…' : 'Accept invitation'}
      </button>
      <button
        onClick={handleDecline}
        disabled={accepting || declining}
        className="btn-ghost w-full disabled:opacity-50 text-sm"
      >
        {declining ? 'Declining…' : 'Decline'}
      </button>
    </div>
  )
}
