import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { getOnboardingRedirect } from '@/lib/onboarding'

// Handles Supabase email confirmation and OAuth redirects
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'

  // Both flows share the same Supabase client setup
  if (code || (token_hash && type)) {
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

    // Claude chose this approach because: OAuth and magic links use `code`,
    // but email confirmation links use `token_hash` + `type`
    let sessionUser = null
    let sessionProviderRefreshToken: string | null = null

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error && data.session) {
        sessionUser = data.session.user
        sessionProviderRefreshToken = data.session.provider_refresh_token ?? null
      }
    } else if (token_hash && type) {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })
      if (!error && data.session) {
        sessionUser = data.session.user
      }
    }

    if (sessionUser) {
      // Store Google refresh token if present (OAuth sign-ins only)
      if (sessionProviderRefreshToken) {
        await supabase.from('user_google_tokens').upsert({
          user_id: sessionUser.id,
          refresh_token: sessionProviderRefreshToken,
        })
      }

      // Normalize first_name from Google metadata
      const userMeta = sessionUser.user_metadata
      const isGoogle = sessionUser.app_metadata?.provider === 'google'

      if (isGoogle && !userMeta.first_name) {
        const googleFirstName =
          userMeta.given_name ||
          (userMeta.full_name ? userMeta.full_name.split(' ')[0] : null)

        if (googleFirstName) {
          await supabase.auth.updateUser({ data: { first_name: googleFirstName } })
        } else {
          return NextResponse.redirect(`${origin}/auth/complete-profile`)
        }
      }

      // Route new/incomplete users through onboarding; fall back to `next` param
      const onboardingPath = await getOnboardingRedirect(supabase, sessionUser)
      return NextResponse.redirect(`${origin}${onboardingPath ?? next}`)
    }
  }

  // Redirect to login with error if exchange fails
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
