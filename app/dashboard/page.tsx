import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import { getOnboardingRedirect } from '@/lib/onboarding'
import Link from 'next/link'
import NewGardenModal from '@/components/NewGardenModal'
import SignOutButtonClient from '@/components/SignOutButton'
import BottomNav from '@/components/BottomNav'
import DailyWeatherTrigger from '@/components/DailyWeatherTrigger'
import DirtFooter from '@/components/DirtFooter'
import InviteBanner from './InviteBanner'
import TooltipTip from '@/components/TooltipTip'

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Resume-state recovery: redirect mid-onboarding users back to where they left off
  const onboardingPath = await getOnboardingRedirect(supabase, user)
  if (onboardingPath) redirect(onboardingPath)

  // RLS now returns all gardens the user is a member of (own + shared)
  const { data: gardens } = await supabase
    .from('gardens')
    .select('*')
    .order('created_at', { ascending: true })

  // Fetch pending invites for this user's email using admin client (bypasses RLS)
  // Claude chose this approach because: garden_invites RLS only allows owners to read;
  // the invited user needs a server-side privileged read to show the dashboard banner
  const adminSupabase = createSupabaseAdminClient()
  const { data: pendingInvites } = user.email
    ? await adminSupabase
        .from('garden_invites')
        .select('token, role, garden_id, invited_by, gardens(name)')
        .eq('email', user.email.toLowerCase())
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
    : { data: [] }

  // Fetch inviter display names for the banner
  const inviterIds = [...new Set((pendingInvites ?? []).map(i => i.invited_by))]
  const inviterMap: Record<string, string> = {}
  if (inviterIds.length > 0) {
    const { data: profiles } = await adminSupabase
      .from('profiles')
      .select('id, display_name')
      .in('id', inviterIds)
    ;(profiles ?? []).forEach(p => { inviterMap[p.id] = p.display_name ?? 'Someone' })
  }

  const invites = (pendingInvites ?? []).map(i => ({
    token: i.token as string,
    role: i.role as string,
    gardenId: i.garden_id as string,
    gardenName: (i.gardens as unknown as { name: string } | null)?.name ?? 'a garden',
    inviterName: inviterMap[i.invited_by as string] ?? 'Someone',
  }))

  return (
    <div className="min-h-screen bg-straw flex flex-col pb-24 md:pb-0">
      <DailyWeatherTrigger />
      {/* Header */}
      <header className="bg-moss px-6 py-4 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-parchment rounded-lg flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/seedling-icon.png" alt="" className="w-6 h-6" aria-hidden="true" />
            </div>
            <span className="font-serif text-lg text-parchment">GrowLog AI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/settings" className="text-sm font-sans text-parchment/70 hover:text-parchment transition-colors hidden sm:inline">
              Settings
            </Link>
            <SignOutButtonClient />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-5 py-8 w-full">
        {/* Pending invite banners */}
        {invites.length > 0 && <InviteBanner invites={invites} />}

        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="font-serif text-3xl text-soil">My Gardens</h1>
            <p className="text-bark text-sm font-sans mt-1">{user.email}</p>
          </div>
          <NewGardenModal />
        </div>

        {(!gardens || gardens.length === 0) ? (
          <div className="card p-12 text-center mt-6">
            <div className="w-16 h-16 bg-sage/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
                   className="w-8 h-8 text-sage">
                <path d="M12 22V12" strokeLinecap="round"/>
                <path d="M12 12C12 12 6 8 6 4a6 6 0 0112 0c0 4-6 8-6 8z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="font-serif text-xl text-soil mb-2">No gardens yet</h2>
            <p className="text-bark text-sm font-sans mb-6 max-w-xs mx-auto">
              Create your first garden to start tracking crops and chatting with your advisor.
            </p>
            <NewGardenModal />
            <div className="mt-4">
              <TooltipTip
                tooltipId="create-garden"
                message="Start by creating your first garden — give it a name and a location."
              />
            </div>
          </div>
        ) : (
          <>
            <TooltipTip
              tooltipId="navigate-gardens"
              message="You can have multiple gardens. Each has its own crops and diary."
            />
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
            {gardens.map((garden) => (
              <Link
                key={garden.id}
                href={`/garden/${garden.id}`}
                className="card p-6 hover:shadow-card-hover transition-all active:scale-[0.99] block"
              >
                <h2 className="font-serif text-xl text-soil">{garden.name}</h2>
                {garden.location && (
                  <p className="text-sm text-bark font-sans mt-1">{garden.location}</p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  {garden.usda_zone && (
                    <span className="text-xs font-sans font-medium text-moss bg-moss/10 border border-moss/20 rounded-full px-2.5 py-1">
                      Zone {garden.usda_zone}
                    </span>
                  )}
                  {!garden.sheet_url && !garden.google_sheet_id && (
                    <span className="text-xs font-sans text-bark/60">No sheet connected</span>
                  )}
                </div>
                <p className="text-xs text-moss font-sans font-medium mt-4">Open garden →</p>
              </Link>
            ))}
            </div>
          </>
        )}
      </main>

      <DirtFooter />
      <BottomNav />
    </div>
  )
}
