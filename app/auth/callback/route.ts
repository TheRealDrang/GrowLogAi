import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// Handles Supabase email confirmation and OAuth redirects
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      // If this is a Google OAuth sign-in, store the refresh token so we can
      // call the Sheets API on the user's behalf later
      if (data.session.provider_refresh_token) {
        await supabase.from('user_google_tokens').upsert({
          user_id: data.session.user.id,
          refresh_token: data.session.provider_refresh_token,
        })
      }

      // Normalize first_name from Google metadata (Google provides given_name and full_name)
      const userMeta = data.session.user.user_metadata
      const isGoogle = data.session.user.app_metadata?.provider === 'google'

      if (isGoogle && !userMeta.first_name) {
        const googleFirstName =
          userMeta.given_name ||
          (userMeta.full_name ? userMeta.full_name.split(' ')[0] : null)

        if (googleFirstName) {
          await supabase.auth.updateUser({ data: { first_name: googleFirstName } })
        } else {
          // Rare: Google didn't provide a name — ask user to fill it in
          return NextResponse.redirect(`${origin}/auth/complete-profile`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Redirect to login with error if exchange fails
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
