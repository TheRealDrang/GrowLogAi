import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/gardens/[id]/members
// Returns the member list, pending invites (owner only), and the current user's role.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify the requester is a member of this garden
  const { data: myMembership } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', id)
    .eq('user_id', user.id)
    .single()

  if (!myMembership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch all members via admin client (bypasses RLS that would otherwise limit results)
  // Claude chose this approach because: garden_members RLS only lets each user see their own row;
  // the owner needs to see all members to manage them
  const adminSupabase = createSupabaseAdminClient()
  const { data: members } = await adminSupabase
    .from('garden_members')
    .select('user_id, role')
    .eq('garden_id', id)

  // Fetch display names from profiles
  const memberIds = (members ?? []).map(m => m.user_id)
  const { data: profiles } = memberIds.length > 0
    ? await adminSupabase.from('profiles').select('id, display_name').in('id', memberIds)
    : { data: [] }
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.display_name]))

  // Fetch auth emails for each member using the admin auth API
  const memberDetails = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data: authData } = await adminSupabase.auth.admin.getUserById(m.user_id)
      return {
        user_id: m.user_id,
        role: m.role,
        display_name: profileMap[m.user_id] ?? null,
        email: authData.user?.email ?? null,
        is_current_user: m.user_id === user.id,
      }
    })
  )

  // Fetch pending invites — only return these to the garden owner
  let pendingInvites: Array<{ token: string; email: string; role: string; expires_at: string }> = []
  if (myMembership.role === 'owner') {
    const { data: invites } = await adminSupabase
      .from('garden_invites')
      .select('token, email, role, expires_at')
      .eq('garden_id', id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
    pendingInvites = invites ?? []
  }

  return NextResponse.json({
    current_user_role: myMembership.role,
    members: memberDetails,
    pending_invites: pendingInvites,
  })
}
