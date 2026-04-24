import { createSupabaseServerClient } from '@/lib/supabase'
import { postToSheet } from '@/lib/sheet-logger'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/session-log — retry posting a failed session log to the sheet
// Body: { session_log_id: string }
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { session_log_id } = await request.json()
  if (!session_log_id) {
    return NextResponse.json({ error: 'session_log_id is required' }, { status: 400 })
  }

  // Load the session log + garden's sheet URL
  const { data: log } = await supabase
    .from('session_logs')
    .select('*, gardens(sheet_url, name)')
    .eq('id', session_log_id)
    .eq('user_id', user.id)
    .single()

  if (!log) return NextResponse.json({ error: 'Session log not found' }, { status: 404 })

  const sheetUrl = (log.gardens as { sheet_url: string | null; name: string })?.sheet_url
  if (!sheetUrl) {
    return NextResponse.json({ error: 'No sheet URL configured for this garden' }, { status: 422 })
  }

  const posted = await postToSheet(sheetUrl, {
    token: process.env.SHEET_SECRET_TOKEN ?? '',
    garden_name: log.garden_name ?? '',
    log_date: log.log_date ?? new Date().toISOString().split('T')[0],
    crop_name: log.crop_name ?? '',
    observation: log.observation ?? '',
    action_taken: log.action_taken ?? '',
    ai_advice: log.ai_advice ?? '',
    weather_summary: log.weather_summary ?? '',
  })

  if (posted) {
    await supabase
      .from('session_logs')
      .update({ sheet_posted: true })
      .eq('id', session_log_id)
  }

  return NextResponse.json({ ok: posted })
}
