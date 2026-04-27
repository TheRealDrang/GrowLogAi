'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import StepIndicator from '@/components/StepIndicator'

function CropForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const gardenId = searchParams.get('garden_id') ?? ''
  // email users: step 3 of 4, google users: step 2 of 3
  const stepTotal = searchParams.get('email') === '1' ? 4 : 3
  const stepCurrent = stepTotal === 4 ? 3 : 2

  const [name, setName] = useState('')
  const [variety, setVariety] = useState('')
  const [bedLocation, setBedLocation] = useState('')
  const [sowDate, setSowDate] = useState('')
  const [notes, setNotes] = useState('')
  const [nameError, setNameError] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setNameError('')

    if (!name.trim()) {
      setNameError('We need at least a crop name to get started.')
      return
    }

    setError(null)
    setLoading(true)

    // Create the crop
    const cropRes = await fetch('/api/crops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        garden_id:    gardenId,
        name:         name.trim(),
        variety:      variety || undefined,
        bed_location: bedLocation || undefined,
        sow_date:     sowDate || undefined,
        notes:        notes || undefined,
      }),
    })

    const cropData = await cropRes.json()

    if (!cropRes.ok) {
      setError(cropData.error ?? 'Something went wrong — please try again.')
      setLoading(false)
      return
    }

    // Prime the chat with a welcome message from the advisor
    await fetch(`/api/crops/${cropData.id}/prime-chat`, { method: 'POST' })
    // Claude chose this approach because: if prime-chat fails the user still
    // lands on the crop page — the advisor can be started manually. Non-fatal.

    router.push(`/crop/${cropData.id}`)
  }

  return (
    <div className="w-full max-w-md">
      <StepIndicator current={stepCurrent} total={stepTotal} />

      <h1 className="font-serif text-2xl text-soil mb-1">Add your first crop</h1>
      <p className="text-bark font-sans text-sm leading-relaxed mb-6">
        Let&apos;s add your first crop so your advisor has something to work with.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="label">
            Crop name <span className="text-harvest normal-case font-normal">*</span>
          </label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setNameError('') }}
            className="input"
            placeholder="Tomato, Basil, Zucchini…"
            autoFocus
          />
          {nameError && (
            <p className="text-harvest text-xs font-sans mt-1.5">{nameError}</p>
          )}
        </div>

        <div>
          <label className="label">Variety</label>
          <input
            value={variety}
            onChange={e => setVariety(e.target.value)}
            className="input"
            placeholder="e.g. Sungold, Genovese"
          />
          <p className="text-xs text-bark/50 font-sans mt-1.5">
            e.g. Sungold, Genovese — add this if you know it
          </p>
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
          <p className="text-xs text-bark/50 font-sans mt-1.5">Approximate is fine</p>
        </div>

        <div>
          <label className="label">Initial notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="input resize-none"
            placeholder="What do you want your advisor to know about this crop?"
          />
        </div>

        {error && (
          <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full disabled:opacity-50"
        >
          {loading ? 'Setting up…' : 'Add crop and meet my advisor →'}
        </button>
      </form>
    </div>
  )
}

export default function OnboardingCropPage() {
  return (
    <Suspense>
      <CropForm />
    </Suspense>
  )
}
