import { createBrowserClient } from '@supabase/ssr'

// Client-side Supabase client — safe to use in Client Components ('use client')
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
