'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface GeoState {
  lat: number | null
  lon: number | null
  zone: string | null
  status: 'idle' | 'loading' | 'found' | 'error'
  message: string
}

interface ExistingGarden {
  id: string
  name: string
  location: string | null
  latitude: number | null
  longitude: number | null
  usda_zone: string | null
}

export default function NewGardenModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [geo, setGeo] = useState<GeoState>({ lat: null, lon: null, zone: null, status: 'idle', message: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [existingGardens, setExistingGardens] = useState<ExistingGarden[]>([])

  // Fetch existing gardens when modal opens to offer location shortcuts
  useEffect(() => {
    if (!open) return
    fetch('/api/gardens')
      .then(r => r.json())
      .then((gardens: ExistingGarden[]) => {
        setExistingGardens(gardens.filter(g => g.location))
      })
      .catch(() => {})
  }, [open])

  // Auto-detect location 700ms after the user stops typing
  useEffect(() => {
    if (!location || location.trim().length < 2) return
    const timer = setTimeout(() => lookupLocation(location), 700)
    return () => clearTimeout(timer)
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
        ? `Zone ${data.zone} · ${data.displayName.split(',').slice(0, 2).join(',').trim()} — location active`
        : `${data.displayName.split(',').slice(0, 2).join(',').trim()} — location active`,
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

    setOpen(false)
    setName(''); setLocation('')
    setGeo({ lat: null, lon: null, zone: null, status: 'idle', message: '' })
    router.refresh()
  }

  function useExistingLocation(garden: ExistingGarden) {
    setLocation(garden.location ?? '')
    setGeo({
      lat: garden.latitude,
      lon: garden.longitude,
      zone: garden.usda_zone,
      status: garden.latitude ? 'found' : 'idle',
      message: garden.usda_zone
        ? `Zone ${garden.usda_zone} · ${garden.location} — location active`
        : `${garden.location} — location active`,
    })
  }

  function handleClose() {
    setOpen(false)
    setName(''); setLocation('')
    setGeo({ lat: null, lon: null, zone: null, status: 'idle', message: '' })
    setError(null)
    setExistingGardens([])
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary gap-2">
        <span className="text-lg leading-none">+</span>
        New garden
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4">
          <div className="bg-parchment w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl">
            <div className="px-6 pt-6 pb-2 border-b border-sage/20">
              <h2 className="font-serif text-xl text-soil">Plant a new garden</h2>
              <p className="text-bark text-sm font-sans mt-0.5">Give it a name and location to get started.</p>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="label">Garden name <span className="text-harvest normal-case">*</span></label>
                <input
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input"
                  placeholder="Backyard raised beds"
                />
              </div>

              <div>
                <label className="label">Location</label>
                {existingGardens.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {existingGardens.map(g => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => useExistingLocation(g)}
                        className="text-xs font-sans px-3 py-1.5 rounded-full border border-sage/40 bg-sage/10 text-moss hover:bg-sage/20 transition-colors"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={location}
                  onChange={e => { setLocation(e.target.value); setGeo(g => ({ ...g, status: 'idle', message: '' })) }}
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
                    Enter a street address for best results. Zone and coordinates detect automatically.
                  </p>
                )}
              </div>

              {error && (
                <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2 pb-1">
                <button type="button" onClick={handleClose} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
                  {loading ? 'Creating…' : 'Create garden'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
