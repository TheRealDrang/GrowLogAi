import { createSupabaseServerClient } from '@/lib/supabase'
import { logDailyWeatherForUser } from '@/lib/daily-weather-log'
import { NextResponse } from 'next/server'

// POST /api/daily-log
// Logs today's weather to the current user's owned garden sheets.
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await logDailyWeatherForUser(supabase, user.id)
  return NextResponse.json(result)
}
