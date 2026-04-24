export interface GeoResult {
  lat: number
  lon: number
  displayName: string
  zone: string | null
}

// Geocode a free-text location using OpenStreetMap Nominatim (free, no API key)
export async function geocodeLocation(location: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', location)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString(), {
    headers: {
      // Nominatim requires a descriptive User-Agent per their usage policy
      'User-Agent': 'GrowLogAI/1.0 (garden logging app)',
    },
  })

  if (!res.ok) return null

  const data = await res.json()
  if (!data.length) return null

  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  }
}

// Look up USDA Plant Hardiness Zone for a lat/lon using phzmapi.org (free, no API key)
// Retries with progressively rounded coordinates — phzmapi.org has gaps at high precision
export async function getUsdaZone(lat: number, lon: number): Promise<string | null> {
  const attempts = [
    [lat, lon],
    [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100],
    [Math.round(lat * 10) / 10, Math.round(lon * 10) / 10],
  ]

  for (const [tryLat, tryLon] of attempts) {
    try {
      const res = await fetch(`https://phzmapi.org/${tryLat}/${tryLon}.json`, {
        headers: { 'User-Agent': 'GrowLogAI/1.0 (garden logging app)' },
      })
      if (!res.ok) continue
      const data = await res.json()
      if (data.zone) return data.zone
    } catch {
      continue
    }
  }

  return null
}
