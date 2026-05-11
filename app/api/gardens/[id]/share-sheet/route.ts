import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'
import { shareSheetWithMember, refreshAccessToken } from '@/lib/google-sheets'

// POST /api/gardens/[id]/share-sheet
// Shares the linked Google Sheet with all current non-owner members via the Drive API.
// Only the garden owner can trigger this (they must be the Google OAuth user who owns the sheet).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  // Get the linked spreadsheet ID
  const { data: garden } = await supabase
    .from('gardens')
    .select('google_sheet_id')
    .eq('id', id)
    .single()

  if (!garden?.google_sheet_id) {
    return NextResponse.json({ error: 'No Google Sheet linked to this garden' }, { status: 400 })
  }

  // Get and refresh the owner's Google token
  const adminSupabase = createSupabaseAdminClient()
  const { data: tokenRow } = await adminSupabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .single()

  if (!tokenRow?.refresh_token) {
    return NextResponse.json({ error: 'No Google token found — please reconnect your Google account.' }, { status: 400 })
  }

  const accessToken = await refreshAccessToken(tokenRow.refresh_token)
  if (!accessToken) {
    return NextResponse.json({ error: 'Could not refresh Google token' }, { status: 500 })
  }

  // Fetch all non-owner members
  const { data: members } = await adminSupabase
    .from('garden_members')
    .select('user_id, role')
    .eq('garden_id', id)
    .neq('role', 'owner')

  if (!members || members.length === 0) {
    return NextResponse.json({ shared: 0 })
  }

  // Resolve each member's email via the admin auth API
  const memberInfo = await Promise.all(
    members.map(async (m) => {
      const { data } = await adminSupabase.auth.admin.getUserById(m.user_id)
      return { email: data.user?.email ?? null, role: m.role }
    })
  )

  // Share with each member — edit role → 'writer', view role → 'reader'
  let shared = 0
  for (const { email, role } of memberInfo) {
    if (!email) continue
    const driveRole = role === 'edit' ? 'writer' : 'reader'
    const ok = await shareSheetWithMember(accessToken, garden.google_sheet_id, email, driveRole)
    if (ok) shared++
  }

  return NextResponse.json({ shared })
}
