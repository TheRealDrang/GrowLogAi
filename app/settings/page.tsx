'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import BottomNav from '@/components/BottomNav'
import DirtFooter from '@/components/DirtFooter'

interface Garden {
  id: string
  name: string
  location: string | null
  usda_zone: string | null
  latitude: number | null
  longitude: number | null
  sheet_url: string | null
  google_sheet_id: string | null
}

interface GeoState {
  lat: number | null
  lon: number | null
  zone: string | null
  status: 'idle' | 'loading' | 'found' | 'error'
  message: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [gardens, setGardens] = useState<Garden[]>([])
  const [selected, setSelected] = useState<Garden | null>(null)
  const [form, setForm] = useState({ location: '', sheet_url: '' })
  const [geo, setGeo] = useState<GeoState>({ lat: null, lon: null, zone: null, status: 'idle', message: '' })
  const locationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGoogleUser, setIsGoogleUser] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch('/api/gardens')
      .then(r => r.json())
      .then(data => {
        setGardens(data)
        if (data.length > 0) selectGarden(data[0])
      })

    // Show Connect button if user has a Google token stored (most reliable check)
    fetch('/api/me/has-google-token')
      .then(r => r.json())
      .then(data => setIsGoogleUser(data.hasToken === true))
  }, [])

  function selectGarden(g: Garden) {
    setSelected(g)
    setForm({ location: g.location ?? '', sheet_url: g.sheet_url ?? '' })
    const hasCoords = !!g.latitude && !!g.longitude
    setGeo({
      lat: g.latitude, lon: g.longitude, zone: g.usda_zone,
      // Claude chose this approach because: show 'found' whenever coords exist so the
      // green confirmation always appears — zone can be null without hiding the address
      status: hasCoords ? 'found' : 'idle',
      message: g.usda_zone
        ? `Zone ${g.usda_zone} · ${g.location ?? ''} — saved and in use`
        : hasCoords
          ? `${g.location ?? ''} — coordinates saved, zone not detected`
          : '',
    })
    setSaved(false)
    setError(null)
    setConfirmDelete(false)
  }

  async function lookupLocation(value: string) {
    if (!value || value.trim().length < 2) return
    setGeo(g => ({ ...g, status: 'loading', message: 'Looking up your location…' }))

    const res = await fetch(`/api/geocode?location=${encodeURIComponent(value)}`)
    const data = await res.json()

    if (!res.ok) {
      setGeo({ lat: null, lon: null, zone: null, status: 'error', message: data.error ?? 'Location not found' })
      return
    }

    setGeo({
      lat: data.lat, lon: data.lon, zone: data.zone,
      status: 'found',
      message: data.zone
        ? `Zone ${data.zone} · ${data.displayName.split(',').slice(0, 2).join(',').trim()}`
        : `${data.displayName.split(',').slice(0, 2).join(',').trim()} — zone not detected, coordinates saved`,
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/gardens/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: form.location,
        sheet_url: form.sheet_url,
        usda_zone: geo.zone,
        latitude: geo.lat,
        longitude: geo.lon,
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? "Couldn't save — please try again.")
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleConnectSheet() {
    if (!selected) return
    setConnecting(true)
    setConnectError(null)

    const res = await fetch(`/api/gardens/${selected.id}/connect-sheet`, { method: 'POST' })
    const data = await res.json()
    setConnecting(false)

    if (!res.ok) {
      setConnectError(data.error ?? 'Could not connect sheet — please try again.')
      return
    }

    // Update local state so the UI switches to the "linked" view immediately
    const updated = { ...selected, google_sheet_id: data.google_sheet_id }
    setSelected(updated)
    setGardens(gs => gs.map(g => g.id === updated.id ? updated : g))
  }

  async function handleDeleteGarden() {
    if (!selected) return
    setDeleting(true)

    const res = await fetch(`/api/gardens/${selected.id}`, { method: 'DELETE' })
    setDeleting(false)

    if (!res.ok) {
      setError('Could not delete garden — please try again.')
      setConfirmDelete(false)
      return
    }

    const remaining = gardens.filter(g => g.id !== selected.id)
    setGardens(remaining)
    if (remaining.length > 0) {
      selectGarden(remaining[0])
    } else {
      setSelected(null)
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-straw flex flex-col pb-24 md:pb-0">
      <header className="bg-moss px-5 py-4 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="text-parchment/70 hover:text-parchment transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <h1 className="font-serif text-lg text-parchment">Settings</h1>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto px-5 py-8 space-y-6 w-full">
        {/* Garden settings */}
        <section className="card p-6">
          <h2 className="font-serif text-xl text-soil mb-5">Garden settings</h2>

          {gardens.length === 0 && (
            <p className="text-bark text-sm font-sans">
              No gardens yet.{' '}
              <Link href="/dashboard" className="text-moss hover:underline">Create one first →</Link>
            </p>
          )}

          {gardens.length > 1 && (
            <div className="mb-5">
              <label className="label">Select garden</label>
              <select
                value={selected?.id ?? ''}
                onChange={e => { const g = gardens.find(x => x.id === e.target.value); if (g) selectGarden(g) }}
                className="input"
              >
                {gardens.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}

          {selected && (
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="label">Location</label>
                <input
                  value={form.location}
                  onChange={e => {
                    const val = e.target.value
                    setForm(f => ({ ...f, location: val }))
                    setGeo(g => ({ ...g, status: 'idle', message: '' }))
                    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current)
                    if (val.trim().length >= 2) {
                      locationDebounceRef.current = setTimeout(() => lookupLocation(val), 700)
                    }
                  }}
                  className="input"
                  placeholder="123 Main St, Portland, OR"
                />
                {geo.status === 'loading' && <p className="text-xs text-bark/60 mt-1.5 font-sans animate-pulse">{geo.message}</p>}
                {geo.status === 'found' && (
                  <div className="mt-1.5">
                    <p className="text-xs text-moss font-sans">✓ {geo.message}</p>
                    {!geo.zone && form.location && (
                      <button
                        type="button"
                        onClick={() => lookupLocation(form.location)}
                        className="text-xs text-moss font-sans underline mt-0.5"
                      >
                        Re-detect zone →
                      </button>
                    )}
                  </div>
                )}
                {geo.status === 'error' && <p className="text-xs text-harvest font-sans mt-1.5">⚠ {geo.message}</p>}
                {geo.status === 'idle' && <p className="text-xs text-bark/50 font-sans mt-1.5">Enter a street address for best results. Zone and coordinates detect automatically.</p>}
              </div>

              <div>
                <label className="label">Google Sheet</label>
                {selected.google_sheet_id ? (
                  <div className="bg-moss/5 border border-moss/20 rounded-xl px-4 py-3">
                    <p className="text-xs text-moss font-sans font-medium">✓ Linked via Google</p>
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${selected.google_sheet_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-bark font-sans hover:text-moss hover:underline mt-0.5 inline-block"
                    >
                      Open spreadsheet →
                    </a>
                  </div>
                ) : isGoogleUser ? (
                  <>
                    <button
                      type="button"
                      onClick={handleConnectSheet}
                      disabled={connecting}
                      className="btn-primary disabled:opacity-50"
                    >
                      {connecting ? 'Creating sheet…' : 'Connect Google Sheet'}
                    </button>
                    <p className="text-xs text-bark/50 font-sans mt-1.5">
                      Creates a new Google Spreadsheet in your Drive and links it to this garden.
                    </p>
                    {connectError && (
                      <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans mt-3">
                        {connectError}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-bark/50 font-sans">
                    No sheet connected.{' '}
                    <a href="/onboarding/sheets" className="text-moss hover:underline">Connect Google Sheets →</a>
                  </p>
                )}
              </div>

              {error && (
                <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans">
                  {error}
                </p>
              )}
              {saved && (
                <p className="text-moss text-sm bg-moss/8 border border-moss/20 rounded-xl px-4 py-3 font-sans">
                  ✓ Changes saved
                </p>
              )}

              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving…' : 'Save changes'}
              </button>

              <div className="border-t border-sage/20 pt-5 mt-2">
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm font-sans text-harvest hover:text-harvest/80 border border-harvest/20 hover:border-harvest/40 rounded-xl px-4 py-2.5 transition-colors"
                  >
                    Delete garden
                  </button>
                ) : (
                  <div className="bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-4 space-y-3">
                    <p className="text-sm font-sans text-soil">
                      Delete <strong>{selected.name}</strong>? This will permanently remove the garden and all its crops and chat history.
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="btn-ghost text-sm flex-1"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteGarden}
                        disabled={deleting}
                        className="text-sm font-sans text-parchment bg-harvest hover:bg-harvest/90 rounded-xl px-4 py-2.5 flex-1 disabled:opacity-50 transition-colors"
                      >
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}
        </section>

        {/* Account */}
        <section className="card p-6">
          <h2 className="font-serif text-xl text-soil mb-4">Account</h2>
          <button
            onClick={handleSignOut}
            className="text-sm font-sans text-harvest hover:text-harvest/80 border border-harvest/20
                       hover:border-harvest/40 rounded-xl px-4 py-2.5 transition-colors"
          >
            Sign out
          </button>
        </section>
      </main>

      <DirtFooter />
      <BottomNav />
    </div>
  )
}
