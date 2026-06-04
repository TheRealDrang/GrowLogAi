import { generateAlerts, sendDigests } from '@/lib/alerts'
import { logDailyWeatherForAllOwners } from '@/lib/daily-weather-log'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

type CronSectionResult<T> = {
  ok: boolean
  durationMs: number
  result: T | null
  error: string | null
}

async function runCronSection<T>(
  name: string,
  task: () => Promise<T>
): Promise<CronSectionResult<T>> {
  const startedAt = Date.now()

  try {
    const result = await task()
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      result,
      error: null,
    }
  } catch (err) {
    console.error(`[cron] ${name} failed:`, err)
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      result: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// GET /api/cron/run-daily
// Called by Vercel Cron at 05:00 UTC daily (Vercel Cron always uses GET).
// Also callable manually with Authorization: Bearer {CRON_SECRET} for testing.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()

  // Codex chose this approach because: the free infrastructure allows one cron, so each job section must fail/report independently inside that single route.
  const alerts = await runCronSection('generateAlerts', generateAlerts)
  const digests = await runCronSection('sendDigests', sendDigests)
  const weatherLog = await runCronSection('logDailyWeatherForAllOwners', () =>
    logDailyWeatherForAllOwners(createSupabaseAdminClient())
  )

  return NextResponse.json({
    ok: alerts.ok && digests.ok && weatherLog.ok,
    durationMs: Date.now() - startedAt,
    sections: {
      alerts,
      digests,
      weatherLog,
    },
  })
}
