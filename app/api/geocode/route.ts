import { createSupabaseServerClient } from '@/lib/supabase'
import { geocodeLocation, getUsdaZone } from '@/lib/geocode'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/geocode?location=Portland+OR
// Returns { lat, lon, displayName, zone } for a location string
export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const location = request.nextUrl.searchParams.get('location')
  if (!location || location.trim().length < 2) {
    return NextResponse.json({ error: 'location is required' }, { status: 400 })
  }

  const geo = await geocodeLocation(location)
  if (!geo) {
    return NextResponse.json({ error: 'Location not found. Try adding a state or country.' }, { status: 404 })
  }

  // Run zone lookup in parallel — if it fails we still return lat/lon
  const zone = await getUsdaZone(geo.lat, geo.lon)

  return NextResponse.json({
    lat: geo.lat,
    lon: geo.lon,
    displayName: geo.displayName,
    zone,
  })
}
