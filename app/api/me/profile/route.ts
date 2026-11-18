import { createSupabaseServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/me/profile — return current user's display name and avatar
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single()

  // Codex chose this approach because: a hidden database error looks like an empty saved name.
  if (error || !data) {
    console.error('[profile] Load failed:', error)
    return NextResponse.json({ error: "Couldn't load your display name. Please try again." }, { status: 500 })
  }
  return NextResponse.json(data)
}

// POST /api/me/profile — update display name
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const display_name = body?.display_name
  if (!display_name || typeof display_name !== 'string' || display_name.trim() === '') {
    return NextResponse.json({ error: 'display_name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('profiles')
    // Codex chose this approach because: signup creates profiles; users may update only their own existing row.
    .update({ display_name: display_name.trim() })
    .eq('id', user.id)
    .select('display_name, avatar_url')
    .single()

  if (error || !data) {
    console.error('[profile] Save failed:', error)
    return NextResponse.json({ error: "Couldn't save your display name. Please try again." }, { status: 500 })
  }
  return NextResponse.json(data)
}
