'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import BottomNav from '@/components/BottomNav'
import DirtFooter from '@/components/DirtFooter'
import GardenMembersSection from './GardenMembersSection'

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
  // deleteStep drives the multi-step delete/transfer flow
  const [deleteStep, setDeleteStep] = useState<'idle' | 'choice' | 'transfer' | 'delete-all'>('idle')
  const [otherMembers, setOtherMembers] = useState<Array<{ user_id: string; display_name: string | null; email: string | null }>>([])
  const [transferTo, setTransferTo] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

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

    fetch('/api/me/profile')
      .then(r => r.json())
      .then(data => {
        const name = data.display_name ?? ''
        setDisplayName(name)
        setDisplayNameInput(name)
      })
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
        ? `Zone ${g.usda_zone} · ${g.location ?? ''} — location active`
        : hasCoords
          ? `${g.location ?? ''} — location active`
          : '',
    })
    setSaved(false)
    setError(null)
    setDeleteStep('idle')
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
        ? `Zone ${data.zone} · ${data.displayName.split(',').slice(0, 2).join(',').trim()} — location active`
        : `${data.displayName.split(',').slice(0, 2).join(',').trim()} — location active`,
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

  async function handleSaveProfile() {
    setSavingProfile(true)
    setProfileSaved(false)
    const res = await fetch('/api/me/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayNameInput }),
    })
    const data = await res.json()
    setSavingProfile(false)
    if (res.ok) {
      setDisplayName(data.display_name)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
    }
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
      setDeleteStep('idle')
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

  // Called when the user first clicks "Delete garden" — checks for other members first
  async function handleClickDelete() {
    if (!selected) return
    const res = await fetch(`/api/gardens/${selected.id}/members`)
    if (res.ok) {
      const data = await res.json()
      type MemberRow = { user_id: string; display_name: string | null; email: string | null; is_current_user: boolean }
      const others: MemberRow[] = (data.members as MemberRow[]).filter(m => !m.is_current_user)
      if (others.length > 0) {
        setOtherMembers(others)
        setTransferTo(others[0].user_id)
        setDeleteStep('choice')
      } else {
        setDeleteStep('delete-all')
      }
    }
  }

  // Transfer ownership then remove this garden from the owner's local list
  async function handleTransfer() {
    if (!selected || !transferTo) return
    setTransferring(true)
    const res = await fetch(`/api/gardens/${selected.id}/transfer-ownership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_owner_user_id: transferTo }),
    })
    setTransferring(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Transfer failed — please try again.')
      setDeleteStep('idle')
      return
    }
    // Current user is no longer owner; remove garden from their list
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
                {deleteStep === 'idle' && (
                  <button
                    type="button"
                    onClick={handleClickDelete}
                    className="text-sm font-sans text-harvest hover:text-harvest/80 border border-harvest/20 hover:border-harvest/40 rounded-xl px-4 py-2.5 transition-colors"
                  >
                    Delete garden
                  </button>
                )}

                {deleteStep === 'choice' && (
                  <div className="bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-4 space-y-4">
                    <p className="text-sm font-sans text-soil">
                      <strong>{selected.name}</strong> has {otherMembers.length} other member{otherMembers.length !== 1 ? 's' : ''}. What would you like to do?
                    </p>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setDeleteStep('transfer')}
                        className="text-sm font-sans text-soil border border-sage/30 hover:border-moss/40 rounded-xl px-4 py-2.5 text-left transition-colors"
                      >
                        Transfer ownership to another member
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteStep('delete-all')}
                        className="text-sm font-sans text-harvest border border-harvest/20 hover:border-harvest/40 rounded-xl px-4 py-2.5 text-left transition-colors"
                      >
                        Delete for everyone
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteStep('idle')}
                      className="text-xs font-sans text-bark/60 hover:text-bark"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {deleteStep === 'transfer' && (
                  <div className="bg-sage/8 border border-sage/20 rounded-xl px-4 py-4 space-y-4">
                    <p className="text-sm font-sans text-soil font-medium">Transfer ownership</p>
                    <div>
                      <label className="label">Transfer to</label>
                      <select
                        value={transferTo}
                        onChange={e => setTransferTo(e.target.value)}
                        className="input"
                      >
                        {otherMembers.map(m => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.display_name ?? m.email ?? 'Member'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-bark/60 font-sans">
                      You will become an editor. The selected member will become the new owner.
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setDeleteStep('choice')}
                        className="btn-ghost text-sm flex-1"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleTransfer}
                        disabled={transferring}
                        className="text-sm font-sans text-parchment bg-moss hover:bg-moss/90 rounded-xl px-4 py-2.5 flex-1 disabled:opacity-50 transition-colors"
                      >
                        {transferring ? 'Transferring…' : 'Transfer & leave'}
                      </button>
                    </div>
                  </div>
                )}

                {deleteStep === 'delete-all' && (
                  <div className="bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-4 space-y-3">
                    <p className="text-sm font-sans text-soil">
                      Delete <strong>{selected.name}</strong>?{' '}
                      {otherMembers.length > 0
                        ? `This will permanently remove the garden and revoke access for all ${otherMembers.length} other member${otherMembers.length !== 1 ? 's' : ''}.`
                        : 'This will permanently remove the garden and all its crops and chat history.'}
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setDeleteStep('idle')}
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

        {/* Members — only shown when NEXT_PUBLIC_SHARING_ENABLED=true (staging/preview only until QA complete) */}
        {selected && process.env.NEXT_PUBLIC_SHARING_ENABLED === 'true' && (
          <GardenMembersSection
            key={selected.id}
            gardenId={selected.id}
            googleSheetId={selected.google_sheet_id}
          />
        )}

        {/* Account */}
        <section className="card p-6">
          <h2 className="font-serif text-xl text-soil mb-5">Account</h2>

          <div className="mb-5">
            <label className="label">Display name</label>
            <div className="flex gap-2">
              <input
                value={displayNameInput}
                onChange={e => setDisplayNameInput(e.target.value)}
                className="input flex-1"
                placeholder="Your name"
              />
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile || displayNameInput.trim() === displayName}
                className="btn-primary disabled:opacity-50"
              >
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
            </div>
            {profileSaved && (
              <p className="text-xs text-moss font-sans mt-1.5">✓ Display name updated</p>
            )}
          </div>

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
