import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Server-side Supabase client — only for Server Components and Route Handlers
// For Client Components, use lib/supabase-browser.ts instead
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Called from a Server Component — cookies cannot be set here,
            // but auth reads still work via middleware refresh.
          }
        },
      },
    }
  )
}

// Admin client — bypasses RLS. Only use server-side for privileged reads (e.g. fetching another user's token).
// Claude chose this approach because: RLS blocks members from reading the garden owner's google token,
// but the chat route must log to the owner's sheet regardless of who sent the message.
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
