'use client'

import { useState, useEffect } from 'react'

// Module-level cache — one fetch shared across all TooltipTip instances on a page.
// Claude chose this approach because: each tip mounts independently; without a cache every
// tip would fire its own fetch, causing N requests on pages with multiple tips.
let cache: { dismissed: Set<string>; expired: boolean } | null = null
let inflight: Promise<void> | null = null

async function loadOnce(): Promise<void> {
  if (cache) return
  try {
    const res = await fetch('/api/me/tooltip-progress')
    if (res.ok) {
      const data = await res.json()
      const ageDays = (Date.now() - new Date(data.first_seen_at).getTime()) / 86400000
      cache = { dismissed: new Set(data.dismissed ?? []), expired: ageDays > 30 }
    } else {
      // Not logged in or error — don't show any tips
      cache = { dismissed: new Set(), expired: true }
    }
  } catch {
    cache = { dismissed: new Set(), expired: true }
  }
}

function ensureLoaded(): Promise<void> {
  if (!inflight) inflight = loadOnce()
  return inflight
}

interface Props {
  tooltipId: string
  message: string
  /**
   * 'inline' (default): renders as a block element in normal document flow.
   * 'above': renders absolute, centered above its nearest `relative` parent — caller must
   *          wrap the target element in a `relative`-positioned container.
   */
  placement?: 'inline' | 'above'
}

export default function TooltipTip({ tooltipId, message, placement = 'inline' }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    ensureLoaded().then(() => {
      if (cache && !cache.expired && !cache.dismissed.has(tooltipId)) {
        setVisible(true)
      }
    })
  }, [tooltipId])

  async function dismiss() {
    setVisible(false)
    cache?.dismissed.add(tooltipId) // optimistic local update
    await fetch('/api/me/tooltip-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tooltip_id: tooltipId }),
    }).catch(() => { /* ignore network errors on dismiss */ })
  }

  if (!visible) return null

  if (placement === 'above') {
    return (
      // Width is fixed so the tip doesn't expand to the container's width.
      // left-1/2 -translate-x-1/2 centers it above the parent element.
      <div className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 z-50 w-52 pointer-events-auto">
        <div className="relative bg-soil text-parchment rounded-xl px-3 py-2.5 shadow-lg">
          <div className="flex items-start gap-2">
            <span className="text-[11px] font-sans leading-relaxed flex-1">{message}</span>
            <button
              onClick={dismiss}
              aria-label="Dismiss tip"
              className="text-parchment/50 hover:text-parchment flex-shrink-0 text-base leading-none"
            >
              ×
            </button>
          </div>
          {/* Downward-pointing arrow */}
          <div className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-soil rotate-45" />
        </div>
      </div>
    )
  }

  // Inline variant — a subtle callout card in normal document flow
  return (
    <div className="flex items-start gap-2.5 bg-moss/8 border border-moss/20 rounded-xl px-4 py-3">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           className="w-4 h-4 text-moss flex-shrink-0 mt-0.5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 8v4M12 16h.01" strokeLinecap="round"/>
      </svg>
      <p className="text-xs text-bark font-sans leading-relaxed flex-1">{message}</p>
      <button
        onClick={dismiss}
        aria-label="Dismiss tip"
        className="text-bark/40 hover:text-soil flex-shrink-0 text-base leading-none mt-0.5"
      >
        ×
      </button>
    </div>
  )
}
