import { createSupabaseServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/alerts/[id] — dismiss or acknowledge an alert
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { status } = body

  if (!['dismissed', 'acknowledged'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  await supabase
    .from('garden_alerts')
    .update({ status, acknowledged_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)  // RLS double-check

  return NextResponse.json({ ok: true })
}
