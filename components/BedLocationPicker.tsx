'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  gardenId: string
  value: string
  onChange: (value: string) => void
}

// Claude chose this approach because: showing a select + "Add new" option makes
// the two paths explicit — pick existing vs create — rather than relying on autocomplete hints
export default function BedLocationPicker({ gardenId, value, onChange }: Props) {
  const [beds, setBeds] = useState<string[]>([])
  const [mode, setMode] = useState<'loading' | 'select' | 'new'>('loading')
  const initialValueRef = useRef(value)

  useEffect(() => {
    if (!gardenId) {
      setMode('new')
      return
    }
    let cancelled = false
    fetch(`/api/gardens/${gardenId}/beds`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const loadedBeds: string[] = data.beds ?? []
        setBeds(loadedBeds)
        const initial = initialValueRef.current
        if (loadedBeds.length === 0 || (initial && !loadedBeds.includes(initial))) {
          setMode('new')
        } else {
          setMode('select')
        }
      })
      .catch(() => { if (!cancelled) setMode('new') })
    return () => { cancelled = true }
  }, [gardenId])

  if (mode === 'loading') {
    return <div className="input bg-sage/10 h-[42px] animate-pulse" />
  }

  if (mode === 'select') {
    return (
      <select
        value={value}
        onChange={e => {
          if (e.target.value === '__new__') {
            onChange('')
            setMode('new')
          } else {
            onChange(e.target.value)
          }
        }}
        className="input"
      >
        <option value="">— Select a bed —</option>
        {beds.map(b => (
          <option key={b} value={b}>{b}</option>
        ))}
        <option value="__new__">＋ Add new bed…</option>
      </select>
    )
  }

  return (
    <div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input"
        placeholder="e.g. Raised bed A, south corner"
      />
      {beds.length > 0 && (
        <button
          type="button"
          onClick={() => { onChange(''); setMode('select') }}
          className="text-xs text-bark/50 hover:text-moss font-sans mt-1 underline"
        >
          ← Pick existing bed
        </button>
      )}
    </div>
  )
}
