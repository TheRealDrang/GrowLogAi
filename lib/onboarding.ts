import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Returns the next onboarding path for a user, or null if setup is complete.
 * Called at auth callback and dashboard load to route users appropriately.
 */
export async function getOnboardingRedirect(
  supabase: SupabaseClient,
  user: User
): Promise<string | null> {
  const isGoogle = user.app_metadata?.provider === 'google'

  // Fetch gardens and token presence in parallel
  const [gardensResult, tokenResult] = await Promise.all([
    supabase
      .from('gardens')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('user_google_tokens')
      .select('user_id')
      .eq('user_id', user.id)
      .single(),
  ])

  const gardens = gardensResult.data ?? []
  const hasGoogleToken = !!tokenResult.data

  if (isGoogle) {
    // Google OAuth users always have a token — guide straight to garden setup
    if (gardens.length === 0) return '/onboarding/welcome'

    const cropsResult = await supabase
      .from('crops')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)

    const hasCrop = (cropsResult.data ?? []).length > 0
    if (!hasCrop) return `/onboarding/crop?garden_id=${gardens[0].id}`
    return null
  }

  // Email/password users
  if (!hasGoogleToken) {
    // No Google token yet — need to connect Sheets
    if (gardens.length === 0) return '/onboarding/welcome'
    return '/onboarding/sheets'
  }

  // Has token
  if (gardens.length === 0) return '/onboarding/garden'

  const cropsResult = await supabase
    .from('crops')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  const hasCrop = (cropsResult.data ?? []).length > 0
  if (!hasCrop) return `/onboarding/crop?garden_id=${gardens[0].id}`
  return null
}
