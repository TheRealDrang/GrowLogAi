import { createSupabaseServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/gardens/[id]/members/[userId]
// Body: { role: 'edit' | 'view' }
// Changes a member's role. Only the garden owner can do this.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify requester is the garden owner
  const { data: ownerCheck } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', id)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .single()

  if (!ownerCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const { role } = body

  if (!['edit', 'view'].includes(role)) {
    return NextResponse.json({ error: 'role must be edit or view' }, { status: 400 })
  }

  // Cannot change the owner's own role
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
  }

  // RLS "owners can manage members" policy enforces ownership at DB level
  const { error } = await supabase
    .from('garden_members')
    .update({ role })
    .eq('garden_id', id)
    .eq('user_id', userId)
    .neq('role', 'owner')  // extra guard: cannot demote the owner row

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/gardens/[id]/members/[userId]
// Removes a member from the garden. Only the garden owner can do this.
// The owner cannot remove themselves.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify requester is the garden owner
  const { data: ownerCheck } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', id)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .single()

  if (!ownerCheck) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Cannot remove the owner (self or otherwise)
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot remove the garden owner' }, { status: 400 })
  }

  const { error } = await supabase
    .from('garden_members')
    .delete()
    .eq('garden_id', id)
    .eq('user_id', userId)
    .neq('role', 'owner')  // extra guard at DB level

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
