import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/crops/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('crops')
    .select('*, gardens(name, location, usda_zone, latitude, longitude, sheet_url)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

// PUT /api/crops/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Claude chose this approach because: the crops UPDATE RLS policy checks garden_members
  // via a subquery that silently fails. Fetch the crop to get garden_id, verify edit/owner
  // membership in code, then write via admin client.
  const { data: crop } = await supabase
    .from('crops')
    .select('garden_id')
    .eq('id', id)
    .single()

  if (!crop) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', crop.garden_id)
    .eq('user_id', user.id)
    .in('role', ['owner', 'edit'])
    .single()

  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const allowed = ['name', 'variety', 'bed_location', 'sow_date', 'end_date', 'status', 'notes']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await createSupabaseAdminClient()
    .from('crops')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/crops/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Claude chose this approach because: same RLS subquery issue as PUT above.
  // Policy allows delete if user is the crop creator OR a garden owner.
  const { data: crop } = await supabase
    .from('crops')
    .select('garden_id, created_by')
    .eq('id', id)
    .single()

  if (!crop) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isCreator = crop.created_by === user.id

  const { data: ownerMembership } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', crop.garden_id)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .single()

  if (!isCreator && !ownerMembership) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await createSupabaseAdminClient()
    .from('crops')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
