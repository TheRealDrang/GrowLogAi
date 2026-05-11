import { createSupabaseServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/me/tooltip-progress
// Returns { dismissed: string[], first_seen_at: string }.
// Creates the tracking row on first call so we can measure the 30-day window.
export async function GET(_request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let { data } = await supabase
    .from('user_tooltip_progress')
    .select('dismissed, first_seen_at')
    .eq('user_id', user.id)
    .single()

  // First visit — insert the row to record first_seen_at
  if (!data) {
    const { data: created } = await supabase
      .from('user_tooltip_progress')
      .insert({ user_id: user.id })
      .select('dismissed, first_seen_at')
      .single()
    data = created
  }

  return NextResponse.json(data ?? { dismissed: [], first_seen_at: new Date().toISOString() })
}

// POST /api/me/tooltip-progress
// Body: { tooltip_id: string } — marks a tooltip as permanently dismissed.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tooltip_id } = await request.json()
  if (!tooltip_id || typeof tooltip_id !== 'string') {
    return NextResponse.json({ error: 'tooltip_id is required' }, { status: 400 })
  }

  // Fetch the current dismissed list then append (avoids needing a custom RPC function)
  const { data: row } = await supabase
    .from('user_tooltip_progress')
    .select('dismissed')
    .eq('user_id', user.id)
    .single()

  const current: string[] = row?.dismissed ?? []
  if (!current.includes(tooltip_id)) {
    await supabase
      .from('user_tooltip_progress')
      .upsert({ user_id: user.id, dismissed: [...current, tooltip_id] })
  }

  return NextResponse.json({ ok: true })
}
