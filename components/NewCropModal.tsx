'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  gardenId: string
}

export default function NewCropModal({ gardenId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [variety, setVariety] = useState('')
  const [bedLocation, setBedLocation] = useState('')
  const [sowDate, setSowDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const res = await fetch('/api/crops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        garden_id:    gardenId,
        name,
        variety:      variety || undefined,
        bed_location: bedLocation || undefined,
        sow_date:     sowDate || undefined,
        notes:        notes || undefined,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong — please try again.')
      return
    }

    setOpen(false)
    setName(''); setVariety(''); setBedLocation(''); setSowDate(''); setNotes('')
    router.refresh()
  }

  function handleClose() {
    setOpen(false)
    setName(''); setVariety(''); setBedLocation(''); setSowDate(''); setNotes('')
    setError(null)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary gap-2">
        <span className="text-lg leading-none">+</span>
        Track a new crop
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4">
          <div className="bg-parchment w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-2 border-b border-sage/20">
              <h2 className="font-serif text-xl text-soil">Track a new crop</h2>
              <p className="text-bark text-sm font-sans mt-0.5">Add a crop to start logging with your AI advisor.</p>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="label">Crop name <span className="text-harvest normal-case">*</span></label>
                <input
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input"
                  placeholder="Tomato, Basil, Zucchini…"
                />
              </div>

              <div>
                <label className="label">Variety</label>
                <input
                  value={variety}
                  onChange={e => setVariety(e.target.value)}
                  className="input"
                  placeholder="e.g. Sungold, Genovese"
                />
              </div>

              <div>
                <label className="label">Bed / Location in garden</label>
                <input
                  value={bedLocation}
                  onChange={e => setBedLocation(e.target.value)}
                  className="input"
                  placeholder="e.g. Raised bed A, south corner"
                />
              </div>

              <div>
                <label className="label">Sow date</label>
                <input
                  type="date"
                  value={sowDate}
                  onChange={e => setSowDate(e.target.value)}
                  className="input"
                />
              </div>

              <div>
                <label className="label">Initial notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="input resize-none"
                  placeholder="Anything worth remembering from the start…"
                />
              </div>

              {error && (
                <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2 pb-1">
                <button type="button" onClick={handleClose} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
                  {loading ? 'Adding…' : 'Add crop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
