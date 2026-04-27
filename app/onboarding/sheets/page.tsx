'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import StepIndicator from '@/components/StepIndicator'

export default function SheetsPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    setLoading(true)
    setError(null)

    const supabase = createSupabaseBrowserClient()
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })

    // Claude chose this approach because: linkIdentity redirects on success,
    // so we only land here if there was an error before redirect
    if (linkError) {
      setError(linkError.message)
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <StepIndicator current={1} total={4} />

      <h1 className="font-serif text-2xl text-soil mb-2">Connect Google Sheets</h1>
      <p className="text-bark font-sans text-sm leading-relaxed mb-6">
        GrowLog logs every advisor session to a spreadsheet — so your growing history lives in a place you own and can search, filter, and share.
      </p>

      <div className="card p-5 mb-6 space-y-3">
        <PermissionRow
          icon="✓"
          label="Create one spreadsheet in your Google Drive"
        />
        <PermissionRow
          icon="✓"
          label="Write session logs to that spreadsheet"
        />
        <PermissionRow
          icon="✗"
          label="Access any other files or folders in your Drive"
          negative
        />
        <PermissionRow
          icon="✗"
          label="Read your email, calendar, or any other Google data"
          negative
        />
      </div>

      {error ? (
        <div className="mb-5">
          <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans mb-4">
            No problem — try again when you&apos;re ready.
          </p>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? 'Connecting…' : 'Try again →'}
          </button>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={loading}
          className="btn-primary w-full disabled:opacity-50"
        >
          {loading ? 'Connecting…' : 'Connect Google Sheets →'}
        </button>
      )}
    </div>
  )
}

function PermissionRow({ icon, label, negative }: { icon: string; label: string; negative?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`text-sm font-semibold flex-shrink-0 ${negative ? 'text-bark/40' : 'text-moss'}`}>
        {icon}
      </span>
      <p className={`text-sm font-sans leading-snug ${negative ? 'text-bark/50' : 'text-bark'}`}>
        {label}
      </p>
    </div>
  )
}
