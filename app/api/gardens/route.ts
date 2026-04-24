import { createSupabaseServerClient } from '@/lib/supabase'
import { refreshAccessToken, createSpreadsheet } from '@/lib/google-sheets'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/gardens — list all gardens for the current user
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('gardens')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

// POST /api/gardens — create a new garden
// For Google OAuth users, automatically creates a linked Google Spreadsheet
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, location, usda_zone, latitude, longitude, sheet_url } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Garden name is required' }, { status: 400 })
  }

  // For Google OAuth users, try to create a Google Spreadsheet automatically
  let googleSheetId: string | null = null

  const { data: tokenRow } = await supabase
    .from('user_google_tokens')
    .select('refresh_token')
    .eq('user_id', user.id)
    .single()

  if (tokenRow?.refresh_token) {
    const accessToken = await refreshAccessToken(tokenRow.refresh_token)
    if (accessToken) {
      googleSheetId = await createSpreadsheet(accessToken, `GrowLog — ${name.trim()}`)
    }
  }

  const { data, error } = await supabase
    .from('gardens')
    .insert({
      user_id: user.id,
      name: name.trim(),
      location: location?.trim() || null,
      usda_zone: usda_zone?.trim() || null,
      latitude: latitude || null,
      longitude: longitude || null,
      sheet_url: sheet_url?.trim() || null,
      google_sheet_id: googleSheetId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
