import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/invites/[token]
// No auth required — the token is the credential.
// Returns enough info for the invite page to render before the user logs in.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const adminSupabase = createSupabaseAdminClient()

  const { data: invite } = await adminSupabase
    .from('garden_invites')
    .select('token, garden_id, invited_by, email, role, accepted_at, expires_at, gardens(name)')
    .eq('token', token)
    .single()

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  // Fetch inviter's display name separately (no direct FK from garden_invites to profiles)
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('display_name')
    .eq('id', invite.invited_by)
    .single()

  const garden = invite.gardens as unknown as { name: string } | null
  const isExpired = new Date(invite.expires_at) < new Date()

  return NextResponse.json({
    garden_id: invite.garden_id,
    garden_name: garden?.name ?? 'Unknown garden',
    invited_by_name: profile?.display_name ?? 'A GrowLog member',
    role: invite.role,
    expires_at: invite.expires_at,
    is_expired: isExpired,
    is_accepted: !!invite.accepted_at,
    email: invite.email,
  })
}

// DELETE /api/invites/[token]
// Cancel a pending invite. Requires the current user to be the garden owner.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS "owners can delete invites" policy enforces ownership — no extra check needed
  const { error } = await supabase
    .from('garden_invites')
    .delete()
    .eq('token', token)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
