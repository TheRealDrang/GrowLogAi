import { createSupabaseServerClient } from '@/lib/supabase'
import { refreshAccessToken, createSpreadsheet } from '@/lib/google-sheets'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/gardens/[id]/connect-sheet
// Creates a new Google Spreadsheet and saves its ID to the garden.
// Used when a Google OAuth user's garden was created before the token was stored.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: garden } = await supabase
    .from('gardens')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!garden) return NextResponse.json({ error: 'Garden not found' }, { status: 404 })

  const { data: tokenRow } = await supabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .single()

  if (!tokenRow?.refresh_token) {
    return NextResponse.json(
      { error: 'No Google account connected. Sign out and sign back in with Google first.' },
      { status: 422 }
    )
  }

  const accessToken = await refreshAccessToken(tokenRow.refresh_token)
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Could not connect to Google. Try signing out and back in.' },
      { status: 422 }
    )
  }

  const sheetId = await createSpreadsheet(accessToken, `GrowLog — ${garden.name}`)
  if (!sheetId) {
    return NextResponse.json(
      { error: 'Could not create Google Sheet. Check that Sheets access was granted when you signed in.' },
      { status: 500 }
    )
  }

  const { data: updated, error } = await supabase
    .from('gardens')
    .update({ google_sheet_id: sheetId })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(updated)
}
