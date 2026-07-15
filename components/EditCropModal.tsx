'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BedLocationPicker from '@/components/BedLocationPicker'

interface Crop {
  id: string
  name: string
  variety?: string | null
  bed_location?: string | null
  sow_date?: string | null
  end_date?: string | null
  status: string
  notes?: string | null
}

interface Props {
  crop: Crop
  gardenId: string
}

const STATUS_OPTIONS = [
  { value: 'growing',   label: 'Growing' },
  { value: 'harvested', label: 'Harvested' },
  { value: 'failed',    label: 'Failed' },
  { value: 'removed',   label: 'Removed' },
]

export default function EditCropModal({ crop, gardenId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name:         crop.name,
    variety:      crop.variety ?? '',
    bed_location: crop.bed_location ?? '',
    sow_date:     crop.sow_date ?? '',
    end_date:     crop.end_date ?? '',
    status:       crop.status,
    notes:        crop.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/crops/${crop.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:         form.name.trim(),
        variety:      form.variety.trim() || null,
        bed_location: form.bed_location.trim() || null,
        sow_date:     form.sow_date || null,
        end_date:     form.end_date || null,
        status:       form.status,
        notes:        form.notes.trim() || null,
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(data.error ?? 'Could not save changes — please try again.')
      return
    }

    setOpen(false)
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/crops/${crop.id}`, { method: 'DELETE' })
    setDeleting(false)

    if (!res.ok) {
      setError('Could not delete crop — please try again.')
      setConfirmDelete(false)
      return
    }

    router.back()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-sans text-parchment/80 hover:text-parchment border border-parchment/30 hover:border-parchment/60
                   px-3 py-1.5 rounded-lg transition-colors"
      >
        Edit crop
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 px-0 sm:px-4">
          {/* flex-col + max-h lets header/footer stay fixed while only the body scrolls */}
          <div className="bg-parchment w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl
                          flex flex-col max-h-[85vh]">

            {/* Fixed header */}
            <div className="flex-shrink-0 px-6 pt-6 pb-2 border-b border-sage/20">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-serif text-xl text-soil">Edit crop</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-shrink-0 text-bark/50 hover:text-soil transition-colors"
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <div>
                  <label className="label">Crop name</label>
                  <input
                    required
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Variety</label>
                  <input
                    value={form.variety}
                    onChange={e => set('variety', e.target.value)}
                    className="input"
                    placeholder="e.g. Sungold, Brandywine"
                  />
                </div>

                <div>
                  <label className="label">Bed / Location</label>
                  <BedLocationPicker gardenId={gardenId} value={form.bed_location} onChange={v => set('bed_location', v)} />
                </div>

                <div>
                  <label className="label">Sow date</label>
                  <input
                    type="date"
                    value={form.sow_date}
                    onChange={e => set('sow_date', e.target.value)}
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Status</label>
                  <select
                    value={form.status}
                    onChange={e => set('status', e.target.value)}
                    className="input"
                  >
                    {STATUS_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {form.status !== 'growing' && (
                  <div>
                    <label className="label">End date</label>
                    <input
                      type="date"
                      value={form.end_date}
                      onChange={e => set('end_date', e.target.value)}
                      className="input"
                    />
                  </div>
                )}

                <div>
                  <label className="label">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    rows={3}
                    className="input resize-none"
                    placeholder="Observations, reminders, anything useful…"
                  />
                </div>

                {error && (
                  <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-2">
                    {error}
                  </p>
                )}

                <div className="border-t border-sage/20 pt-4 pb-2">
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="text-sm font-sans text-harvest hover:text-harvest/80 border border-harvest/20 hover:border-harvest/40 rounded-xl px-4 py-2.5 transition-colors"
                    >
                      Delete crop
                    </button>
                  ) : (
                    <div className="bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-4 space-y-3">
                      <p className="text-sm font-sans text-soil">
                        Delete <strong>{crop.name}</strong>? This will permanently remove the crop and all its chat history.
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
                          onClick={handleDelete}
                          disabled={deleting}
                          className="text-sm font-sans text-parchment bg-harvest hover:bg-harvest/90 rounded-xl px-4 py-2.5 flex-1 disabled:opacity-50 transition-colors"
                        >
                          {deleting ? 'Deleting…' : 'Yes, delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>{/* end scrollable body */}

              {/* Fixed footer — always visible */}
              <div className="flex-shrink-0 flex gap-3 px-6 py-4 border-t border-sage/20">
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
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
