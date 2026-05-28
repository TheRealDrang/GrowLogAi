import { generateAlerts, sendDigests } from '@/lib/alerts'
import { logDailyWeatherForAllOwners } from '@/lib/daily-weather-log'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/cron/run-daily
// Called by Vercel Cron at 05:00 UTC daily.
// Also callable manually with Authorization: Bearer {CRON_SECRET} for testing.
export async function POST(request: NextRequest) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let alertsOk = false
  try {
    await generateAlerts()
    alertsOk = true
  } catch (err) {
    console.error('[cron] generateAlerts failed:', err)
  }

  let digestsOk = false
  try {
    await sendDigests()
    digestsOk = true
  } catch (err) {
    console.error('[cron] sendDigests failed:', err)
  }

  let weatherLogOk = false
  let weatherLogResult = null
  try {
    weatherLogResult = await logDailyWeatherForAllOwners(createSupabaseAdminClient())
    weatherLogOk = true
  } catch (err) {
    console.error('[cron] logDailyWeatherForAllOwners failed:', err)
  }

  return NextResponse.json({ alertsOk, digestsOk, weatherLogOk, weatherLogResult })
}
