import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/invites/[token]/accept
// Accepts a pending garden invite for the logged-in user.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminSupabase = createSupabaseAdminClient()

  // Look up invite using admin client (bypasses RLS — any valid token can be looked up)
  const { data: invite } = await adminSupabase
    .from('garden_invites')
    .select('id, garden_id, email, role, accepted_at, expires_at')
    .eq('token', token)
    .single()

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  if (invite.accepted_at) {
    return NextResponse.json({ error: 'This invite has already been accepted' }, { status: 409 })
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })
  }

  // Verify the logged-in user's email matches the invite
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json(
      { error: `This invite was sent to ${invite.email}. Please sign in with that account.` },
      { status: 403 }
    )
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', invite.garden_id)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json(
      { garden_id: invite.garden_id, already_member: true },
      { status: 200 }
    )
  }

  // Add to garden_members using admin client (bypasses the insert policy which requires existing membership)
  // Claude chose this approach because: the user accepting an invite isn't yet a member,
  // so the RLS insert policy would block them — admin client handles this one-time bootstrap
  const { error: memberError } = await adminSupabase
    .from('garden_members')
    .insert({
      garden_id: invite.garden_id,
      user_id: user.id,
      role: invite.role,
    })

  if (memberError) {
    return NextResponse.json({ error: 'Could not add you to the garden' }, { status: 500 })
  }

  // Mark invite as accepted
  await adminSupabase
    .from('garden_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token', token)

  return NextResponse.json({ garden_id: invite.garden_id })
}
