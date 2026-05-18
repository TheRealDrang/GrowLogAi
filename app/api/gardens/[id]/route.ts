import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/gardens/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('gardens')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

// PUT /api/gardens/[id] — update garden fields
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Claude chose this approach because: the gardens UPDATE RLS policy checks garden_members
  // via a subquery, which silently returns 0 rows (same pattern as member management routes).
  // Verify ownership in code, then write via admin client.
  const { data: membership } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', id)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .single()

  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const allowed = ['name', 'location', 'usda_zone', 'latitude', 'longitude', 'sheet_url']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await createSupabaseAdminClient()
    .from('gardens')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/gardens/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Claude chose this approach because: same RLS subquery issue as PUT above.
  const { data: membership } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', id)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .single()

  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await createSupabaseAdminClient()
    .from('gardens')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
