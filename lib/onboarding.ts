import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Returns the next onboarding path for a user, or null if setup is complete.
 * Called at auth callback and dashboard load to route users appropriately.
 */
export async function getOnboardingRedirect(
  supabase: SupabaseClient,
  user: User
): Promise<string | null> {
  // Check for a pending garden invite in user metadata (set by inviteUserByEmail).
  // Invited new users should accept their invite before going through onboarding.
  const inviteToken = user.user_metadata?.garden_invite_token
  if (inviteToken) {
    const { data: invite } = await supabase
      .from('garden_invites')
      .select('accepted_at')
      .eq('token', inviteToken)
      .single()
    if (invite && !invite.accepted_at) {
      return `/invites/${inviteToken}`
    }
  }

  const isGoogle = user.app_metadata?.provider === 'google'

  // Check garden membership (any role) — replaces the old user_id filter on gardens.
  // An invited user who joined someone else's garden also counts as "has a garden".
  const [membershipsResult, tokenResult] = await Promise.all([
    supabase
      .from('garden_members')
      .select('garden_id, role')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true }),
    supabase
      .from('user_google_tokens')
      .select('user_id')
      .eq('user_id', user.id)
      .single(),
  ])

  const memberships = membershipsResult.data ?? []
  const hasGoogleToken = !!tokenResult.data

  // If the user is in any garden (own or shared), they've completed the garden step.
  // Only check for a crop if they OWN a garden (invited-only members skip crop onboarding).
  const ownedGarden = memberships.find(m => m.role === 'owner')

  if (isGoogle) {
    if (memberships.length === 0) return '/onboarding/welcome'

    // Invited member with no owned garden — skip onboarding, go to dashboard
    if (!ownedGarden) return null

    // Claude chose this approach because: filtering by created_by can fail when the
    // session auth.uid() doesn't match stored UUIDs due to RLS evaluation order.
    // Checking the owned garden for any crops is also more correct for shared gardens
    // (an owner's garden is set up once it has crops, regardless of who created them).
    const cropsResult = await supabase
      .from('crops')
      .select('id')
      .eq('garden_id', ownedGarden.garden_id)
      .limit(1)

    const hasCrop = (cropsResult.data ?? []).length > 0
    if (!hasCrop) return `/onboarding/crop?garden_id=${ownedGarden.garden_id}`
    return null
  }

  // Email/password users
  if (!hasGoogleToken) {
    if (memberships.length === 0) return '/onboarding/welcome'
    return '/onboarding/sheets'
  }

  // Has Google token
  if (memberships.length === 0) return '/onboarding/garden'

  // Invited member with no owned garden — skip onboarding
  if (!ownedGarden) return null

  const cropsResult = await supabase
    .from('crops')
    .select('id')
    .eq('garden_id', ownedGarden.garden_id)
    .limit(1)

  const hasCrop = (cropsResult.data ?? []).length > 0
  if (!hasCrop) return `/onboarding/crop?garden_id=${ownedGarden.garden_id}`
  return null
}
