'use client'

import { useState } from 'react'

interface Alert {
  id: string
  alert_type: string
  priority: number
  title: string
  body: string
  action_label: string | null
  action_url: string | null
  gardens: { name: string } | null
  crops: { name: string } | null
}

const ALERT_ICONS: Record<string, string> = {
  weather_rain: '🌧',
  weather_dry: '☀️',
  weather_frost: '🌡️',
  weather_mildew: '🍄',
  weather_wind: '💨',
  no_checkin: '📋',
  followup_ph: '🧪',
  followup_pest: '🐛',
  followup_fertilize: '🌿',
  followup_transplant: '🌱',
  harvest_approaching: '🌾',
  ai_insight: '✨',
}

export default function AdvisorNotes({ initialAlerts }: { initialAlerts: Alert[] }) {
  const [alerts, setAlerts] = useState(initialAlerts)
  const [showAll, setShowAll] = useState(false)

  async function dismiss(id: string) {
    // Optimistically remove from UI
    setAlerts(prev => prev.filter(a => a.id !== id))
    await fetch(`/api/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    })
  }

  if (alerts.length === 0) return null

  const visible = showAll ? alerts : alerts.slice(0, 3)

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-lg text-soil font-semibold">Advisor Notes</h2>
        <span className="text-sm text-soil/60 font-sans">
          {alerts.length} item{alerts.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {visible.map(alert => (
          <div
            key={alert.id}
            className={`bg-parchment border rounded-card shadow-card p-4 ${
              alert.priority === 1 ? 'border-harvest/40' : 'border-moss/20'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span aria-hidden="true">{ALERT_ICONS[alert.alert_type] ?? '📌'}</span>
                  <span className="font-semibold text-soil text-sm">{alert.title}</span>
                  {alert.gardens && (
                    <span className="text-xs text-soil/50 font-sans">{alert.gardens.name}</span>
                  )}
                </div>
                <p className="text-sm text-soil/80 font-sans mb-2 leading-relaxed">{alert.body}</p>
                {alert.action_url && (
                  <a
                    href={alert.action_url}
                    className="text-sm text-moss font-medium font-sans hover:underline"
                  >
                    {alert.action_label ?? 'View →'}
                  </a>
                )}
              </div>
              <button
                onClick={() => dismiss(alert.id)}
                className="text-soil/30 hover:text-soil/60 text-lg leading-none flex-shrink-0 transition-colors"
                aria-label="Dismiss alert"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {alerts.length > 3 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 text-sm text-moss font-sans hover:underline"
        >
          Show all ({alerts.length}) →
        </button>
      )}
    </div>
  )
}
