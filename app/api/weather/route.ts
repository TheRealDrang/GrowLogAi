import { fetchWeather } from '@/lib/weather'
import { createSupabaseServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/weather?lat=xx&lon=yy
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lat = parseFloat(request.nextUrl.searchParams.get('lat') ?? '')
  const lon = parseFloat(request.nextUrl.searchParams.get('lon') ?? '')

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat and lon are required' }, { status: 400 })
  }

  const weather = await fetchWeather(lat, lon)
  if (!weather) {
    return NextResponse.json({ error: 'Could not fetch weather' }, { status: 502 })
  }

  return NextResponse.json(weather)
}
