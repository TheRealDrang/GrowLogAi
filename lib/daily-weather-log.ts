import { SupabaseClient } from '@supabase/supabase-js'
import { refreshAccessToken, appendToDailyLog } from '@/lib/google-sheets'
import { fetchWeather } from '@/lib/weather'

type GardenForWeatherLog = {
  id: string
  name: string
  location: string | null
  usda_zone: string | null
  latitude: number | null
  longitude: number | null
  google_sheet_id: string | null
  weather_logged_date: string | null
}

type OwnerMembership = {
  garden_id: string
  user_id: string
}

type GoogleToken = {
  user_id: string
  refresh_token: string
}

type DailyWeatherLogResult = {
  logged: number
  attempted: number
  skipped: number
  failed: number
}

const todayIsoDate = () => new Date().toISOString().split('T')[0]

async function appendWeatherForGardens(
  supabase: SupabaseClient,
  userId: string,
  gardens: GardenForWeatherLog[],
  today: string
): Promise<DailyWeatherLogResult> {
  const dueGardens = gardens.filter(g => g.weather_logged_date !== today)
  if (dueGardens.length === 0) {
    return { logged: 0, attempted: 0, skipped: gardens.length, failed: 0 }
  }

  const { data: tokenRow, error: tokenError } = await supabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', userId)
    .single()

  if (tokenError || !tokenRow?.refresh_token) {
    return { logged: 0, attempted: 0, skipped: dueGardens.length, failed: 0 }
  }

  const accessToken = await refreshAccessToken(tokenRow.refresh_token)
  if (!accessToken) {
    return { logged: 0, attempted: 0, skipped: dueGardens.length, failed: 0 }
  }

  let logged = 0
  let failed = 0

  await Promise.all(dueGardens.map(async (garden) => {
    try {
      if (!garden.latitude || !garden.longitude || !garden.google_sheet_id) return

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
    } catch (err) {
      failed++
      console.error(`[dailyWeatherLog] garden ${garden.id}:`, err)
    }
  }))

  return {
    logged,
    attempted: dueGardens.length,
    skipped: Math.max(dueGardens.length - logged - failed, 0),
    failed,
  }
}

export async function logDailyWeatherForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<DailyWeatherLogResult> {
  const today = todayIsoDate()

  const { data: ownerMemberships } = await supabase
    .from('garden_members')
    .select('garden_id')
    .eq('user_id', userId)
    .eq('role', 'owner')

  const ownedIds = ((ownerMemberships ?? []) as Pick<OwnerMembership, 'garden_id'>[])
    .map(row => row.garden_id)

  if (ownedIds.length === 0) {
    return { logged: 0, attempted: 0, skipped: 0, failed: 0 }
  }

  const { data: gardens } = await supabase
    .from('gardens')
    .select('id, name, location, usda_zone, latitude, longitude, google_sheet_id, weather_logged_date')
    .in('id', ownedIds)
    .not('google_sheet_id', 'is', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  return appendWeatherForGardens(
    supabase,
    userId,
    (gardens ?? []) as GardenForWeatherLog[],
    today
  )
}

export async function logDailyWeatherForAllOwners(
  supabase: SupabaseClient
): Promise<DailyWeatherLogResult> {
  const today = todayIsoDate()

  const { data: ownerMembershipRows } = await supabase
    .from('garden_members')
    .select('garden_id, user_id')
    .eq('role', 'owner')

  const ownerMemberships = (ownerMembershipRows ?? []) as OwnerMembership[]
  if (ownerMemberships.length === 0) {
    return { logged: 0, attempted: 0, skipped: 0, failed: 0 }
  }

  const ownerByGardenId = new Map(ownerMemberships.map(row => [row.garden_id, row.user_id]))
  const gardenIds = ownerMemberships.map(row => row.garden_id)

  const { data: gardenRows } = await supabase
    .from('gardens')
    .select('id, name, location, usda_zone, latitude, longitude, google_sheet_id, weather_logged_date')
    .in('id', gardenIds)
    .not('google_sheet_id', 'is', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  const dueGardens = ((gardenRows ?? []) as GardenForWeatherLog[])
    .filter(garden => garden.weather_logged_date !== today)

  if (dueGardens.length === 0) {
    return { logged: 0, attempted: 0, skipped: 0, failed: 0 }
  }

  const ownerIds = [...new Set(dueGardens
    .map(garden => ownerByGardenId.get(garden.id))
    .filter((userId): userId is string => Boolean(userId)))]

  const { data: tokenRows } = await supabase
    .from('user_google_tokens')
    .select('user_id, refresh_token')
    .in('user_id', ownerIds)

  const tokenByOwnerId = new Map(
    ((tokenRows ?? []) as GoogleToken[]).map(row => [row.user_id, row.refresh_token])
  )

  const gardensByOwnerId = new Map<string, GardenForWeatherLog[]>()
  dueGardens.forEach((garden) => {
    const ownerId = ownerByGardenId.get(garden.id)
    if (!ownerId || !tokenByOwnerId.has(ownerId)) return
    gardensByOwnerId.set(ownerId, [...(gardensByOwnerId.get(ownerId) ?? []), garden])
  })

  let logged = 0
  let attempted = 0
  let failed = 0

  // Codex chose this approach because: cron can process all owners server-side without making dashboard visitors wait for sheet/weather calls.
  for (const [ownerId, ownerGardens] of gardensByOwnerId) {
    try {
      const refreshToken = tokenByOwnerId.get(ownerId)
      if (!refreshToken) continue

      const accessToken = await refreshAccessToken(refreshToken)
      if (!accessToken) continue

      attempted += ownerGardens.length

      await Promise.all(ownerGardens.map(async (garden) => {
        try {
          if (!garden.latitude || !garden.longitude || !garden.google_sheet_id) return

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
        } catch (err) {
          failed++
          console.error(`[dailyWeatherLog] garden ${garden.id}:`, err)
        }
      }))
    } catch (err) {
      failed += ownerGardens.length
      console.error(`[dailyWeatherLog] owner ${ownerId}:`, err)
    }
  }

  return {
    logged,
    attempted,
    skipped: Math.max(dueGardens.length - logged - failed, 0),
    failed,
  }
}
