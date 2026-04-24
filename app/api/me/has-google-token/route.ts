import { createSupabaseServerClient } from '@/lib/supabase'
import { NextResponse } from 'next/server'

// GET /api/me/has-google-token
// Returns { hasToken: true } if the user has a stored Google refresh token.
// Used by Settings to decide whether to show the Connect Google Sheet button.
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ hasToken: false })

  const { data } = await supabase
    .from('user_google_tokens')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ hasToken: !!data })
}
