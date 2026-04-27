'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import StepIndicator from '@/components/StepIndicator'

interface GeoState {
  lat: number | null
  lon: number | null
  zone: string | null
  status: 'idle' | 'loading' | 'found' | 'error'
  message: string
}

function GardenForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // email users have 4 steps (sheets + garden + crop + advisor), google users have 3
  const stepTotal = searchParams.get('email') === '1' ? 4 : 3
  const stepCurrent = stepTotal === 4 ? 2 : 1

  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [geo, setGeo] = useState<GeoState>({ lat: null, lon: null, zone: null, status: 'idle', message: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!location || location.trim().length < 2) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => lookupLocation(location), 700)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [location])

  async function lookupLocation(value: string) {
    if (!value || value.trim().length < 2) return
    setGeo(g => ({ ...g, status: 'loading', message: 'Looking up your location…' }))

    const res = await fetch(`/api/geocode?location=${encodeURIComponent(value)}`)
    const data = await res.json()

    if (!res.ok) {
      setGeo({ lat: null, lon: null, zone: null, status: 'error', message: data.error ?? 'Location not found — try adding a state or country' })
      return
    }

    setGeo({
      lat: data.lat,
      lon: data.lon,
      zone: data.zone,
      status: 'found',
      message: data.zone
        ? `Zone ${data.zone} · ${data.displayName.split(',').slice(0, 2).join(',').trim()}`
        : `${data.displayName.split(',').slice(0, 2).join(',').trim()} — zone not detected, but coordinates saved`,
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const res = await fetch('/api/gardens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, location, usda_zone: geo.zone, latitude: geo.lat, longitude: geo.lon }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong — please try again.')
      return
    }

    router.push(`/onboarding/crop?garden_id=${data.id}`)
  }

  return (
    <div className="w-full max-w-md">
      <StepIndicator current={stepCurrent} total={stepTotal} />

      <h1 className="font-serif text-2xl text-soil mb-2">Set up your garden</h1>
      <p className="text-bark font-sans text-sm leading-relaxed mb-6">
        Your advisor uses your garden location for zone-aware advice and weather context.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="label">
            Garden name <span className="text-harvest normal-case font-normal">*</span>
          </label>
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            className="input"
            placeholder="Backyard, Front raised beds…"
            autoFocus
          />
          <p className="text-xs text-bark/50 font-sans mt-1.5">
            Call it whatever makes sense — &ldquo;Backyard&rdquo;, &ldquo;Front raised beds&rdquo;, anything.
          </p>
        </div>

        <div>
          <label className="label">Location</label>
          <p className="text-xs text-bark/50 font-sans mb-1.5">
            Your address stays on your account and is never shared.
          </p>
          <input
            value={location}
            onChange={e => {
              setLocation(e.target.value)
              setGeo(g => ({ ...g, status: 'idle', message: '' }))
            }}
            className="input"
            placeholder="123 Main St, Portland, OR"
          />
          {geo.status === 'loading' && (
            <p className="text-xs text-bark/60 mt-1.5 font-sans animate-pulse">{geo.message}</p>
          )}
          {geo.status === 'found' && (
            <p className="text-xs text-moss font-sans mt-1.5">✓ {geo.message}</p>
          )}
          {geo.status === 'error' && (
            <p className="text-xs text-harvest font-sans mt-1.5">⚠ {geo.message}</p>
          )}
          {geo.status === 'idle' && (
            <p className="text-xs text-bark/50 font-sans mt-1.5">
              Zone and planting dates auto-detect from your address.
            </p>
          )}
        </div>

        {error && (
          <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="btn-primary w-full disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Next →'}
        </button>
      </form>
    </div>
  )
}

export default function OnboardingGardenPage() {
  return (
    <Suspense>
      <GardenForm />
    </Suspense>
  )
}
