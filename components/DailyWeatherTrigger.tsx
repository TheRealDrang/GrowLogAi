'use client'

import { useEffect } from 'react'

// Fires once on dashboard mount. Silently logs today's weather to each garden's
// Daily Log tab if it hasn't been logged yet today. Renders nothing.
export default function DailyWeatherTrigger() {
  useEffect(() => {
    fetch('/api/daily-log', { method: 'POST' }).catch(() => {})
  }, [])
  return null
}
