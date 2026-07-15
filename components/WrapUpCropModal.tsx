'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  cropId: string
  cropName: string
  status: string
}

const REASON_OPTIONS = [
  { value: 'harvested', label: 'Harvested' },
  { value: 'failed',    label: 'Failed' },
  { value: 'removed',   label: 'Removed / other' },
]

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export default function WrapUpCropModal({ cropId, cropName, status }: Props) {
  const router = useRouter()
  const isActive = status === 'growing'

  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('harvested')
  const [endDate, setEndDate] = useState(todayISO)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleWrapUp(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/crops/${cropId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: reason, end_date: endDate }),
    })

    setSaving(false)
    if (!res.ok) {
      setError('Could not wrap up crop — please try again.')
      return
    }

    setOpen(false)
    router.refresh()
  }

  async function handleReopen() {
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/crops/${cropId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'growing', end_date: null }),
    })

    setSaving(false)
    if (!res.ok) {
      setError('Could not reopen crop — please try again.')
      return
    }

    router.refresh()
  }

  if (!isActive) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-harvest">{error}</span>}
        <button
          onClick={handleReopen}
          disabled={saving}
          className="text-sm font-sans text-parchment/80 hover:text-parchment border border-parchment/30 hover:border-parchment/60
                     px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Reopening…' : 'Reopen'}
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setEndDate(todayISO()); setError(null) }}
        className="text-sm font-sans text-parchment/80 hover:text-parchment border border-parchment/30 hover:border-parchment/60
                   px-3 py-1.5 rounded-lg transition-colors"
      >
        Wrap up
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4">
          <div className="bg-parchment w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl">
            <div className="px-6 pt-6 pb-2 border-b border-sage/20">
              <h2 className="font-serif text-xl text-soil">Wrap up {cropName}</h2>
              <p className="text-sm font-sans text-bark mt-1">
                Mark this crop as finished. It will move to the Completed section.
              </p>
            </div>

            <form onSubmit={handleWrapUp} className="px-6 py-5 space-y-4">
              <div>
                <label className="label">Reason</label>
                <select
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="input"
                >
                  {REASON_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">End date</label>
                <input
                  type="date"
                  required
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="input"
                />
              </div>

              {error && (
                <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2 pb-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-ghost flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Wrap up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
