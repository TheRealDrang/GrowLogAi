import { createSupabaseServerClient } from '@/lib/supabase'
import { fetchWeather } from '@/lib/weather'
import { refreshAccessToken, appendToDailyLog } from '@/lib/google-sheets'
import { NextResponse } from 'next/server'

// POST /api/daily-log
// Called from the dashboard on mount. Logs today's weather to the "Daily Log" tab
// of every garden spreadsheet that hasn't been logged yet today.
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]

  // Get all gardens with a Google Sheet linked, coordinates available, and not yet logged today
  const { data: gardens } = await supabase
    .from('gardens')
    .select('id, name, location, usda_zone, latitude, longitude, google_sheet_id, weather_logged_date')
    .eq('user_id', user.id)
    .not('google_sheet_id', 'is', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  if (!gardens || gardens.length === 0) {
    return NextResponse.json({ logged: 0 })
  }

  // Only process gardens that haven't been logged today
  const due = gardens.filter(g => g.weather_logged_date !== today)
  if (due.length === 0) {
    return NextResponse.json({ logged: 0, message: 'Already logged today' })
  }

  // Get the user's Google refresh token once
  const { data: tokenRow } = await supabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .single()

  if (!tokenRow?.refresh_token) {
    return NextResponse.json({ logged: 0 })
  }

  const accessToken = await refreshAccessToken(tokenRow.refresh_token)
  if (!accessToken) {
    return NextResponse.json({ logged: 0 })
  }

  // Log weather for each due garden in parallel
  let logged = 0
  await Promise.all(due.map(async (garden) => {
    const weather = await fetchWeather(garden.latitude, garden.longitude)
    if (!weather) return

    const posted = await appendToDailyLog(accessToken, garden.google_sheet_id, {
      log_date: today,
      garden_name: garden.name,
      location: garden.location ?? '',
      usda_zone: garden.usda_zone ?? '',
      temperature: weather.temperature,
      humidity: weather.humidity,
      windspeed: weather.windspeed,
      conditions: weather.description,
      mildew_risk: weather.mildewRisk,
    })

    if (posted) {
      await supabase
        .from('gardens')
        .update({ weather_logged_date: today })
        .eq('id', garden.id)
      logged++
    }
  }))

  return NextResponse.json({ logged })
}
