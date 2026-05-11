import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/gardens/[id]/transfer-ownership
// Body: { new_owner_user_id: string }
// Demotes the current owner to 'edit' and promotes a current member to 'owner'.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { new_owner_user_id } = body

  if (!new_owner_user_id || typeof new_owner_user_id !== 'string') {
    return NextResponse.json({ error: 'new_owner_user_id is required' }, { status: 400 })
  }

  if (new_owner_user_id === user.id) {
    return NextResponse.json({ error: 'You are already the owner' }, { status: 400 })
  }

  // Verify requester is the current owner
  const { data: ownerCheck } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', id)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .single()

  if (!ownerCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify the new owner is an existing member of this garden
  const { data: newOwnerCheck } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', id)
    .eq('user_id', new_owner_user_id)
    .single()

  if (!newOwnerCheck) {
    return NextResponse.json({ error: 'Selected user is not a member of this garden' }, { status: 400 })
  }

  // Claude chose this approach because: after demoting the current owner, RLS would block
  // the second update (they're no longer owner). Using admin client for both updates is safest
  // and ensures atomicity — if one fails, we return an error before the other can leave the DB
  // in an inconsistent state (two owners or no owner).
  const adminSupabase = createSupabaseAdminClient()

  const [demoteRes, promoteRes] = await Promise.all([
    adminSupabase
      .from('garden_members')
      .update({ role: 'edit' })
      .eq('garden_id', id)
      .eq('user_id', user.id),
    adminSupabase
      .from('garden_members')
      .update({ role: 'owner' })
      .eq('garden_id', id)
      .eq('user_id', new_owner_user_id),
  ])

  if (demoteRes.error || promoteRes.error) {
    return NextResponse.json({ error: 'Transfer failed — please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
