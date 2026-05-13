import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import Link from 'next/link'
import InviteActions from './InviteActions'

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params
  const adminSupabase = createSupabaseAdminClient()

  // Fetch invite details — no auth required, token is the credential
  const { data: invite } = await adminSupabase
    .from('garden_invites')
    .select('id, garden_id, invited_by, email, role, accepted_at, expires_at, gardens(name)')
    .eq('token', token)
    .single()

  // Token not found
  if (!invite) {
    return <InviteShell><ErrorCard message="This invite link is not valid." /></InviteShell>
  }

  // Token expired
  const isExpired = new Date(invite.expires_at) < new Date()
  if (isExpired && !invite.accepted_at) {
    const { data: profile } = await adminSupabase
      .from('profiles').select('display_name').eq('id', invite.invited_by).single()
    return (
      <InviteShell>
        <ErrorCard message={`This invite link has expired. Ask ${profile?.display_name ?? 'the garden owner'} to send a new one.`} />
      </InviteShell>
    )
  }

  const garden = invite.gardens as unknown as { name: string } | null
  const gardenName = garden?.name ?? 'the garden'
  const roleLabel = invite.role === 'edit' ? 'editor' : 'view-only member'

  // Fetch inviter display name
  const { data: inviterProfile } = await adminSupabase
    .from('profiles').select('display_name').eq('id', invite.invited_by).single()
  const inviterName = inviterProfile?.display_name ?? 'A GrowLog member'

  // Check if user is logged in
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in — show sign-in prompt
  if (!user) {
    return (
      <InviteShell>
        <InviteCard gardenName={gardenName} inviterName={inviterName} roleLabel={roleLabel}>
          <div className="space-y-3">
            <Link
              href={`/login?next=/invites/${token}`}
              className="btn-primary w-full text-center block"
            >
              Sign in to join
            </Link>
            <Link
              href={`/signup?next=/invites/${token}`}
              className="btn-ghost w-full text-center block text-sm"
            >
              Create a free account →
            </Link>
          </div>
        </InviteCard>
      </InviteShell>
    )
  }

  // Wrong email
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <InviteShell>
        <ErrorCard
          message={`This invite was sent to ${invite.email}. Please sign in with that account.`}
        />
      </InviteShell>
    )
  }

  // Already accepted — check if already a member
  const { data: existingMembership } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', invite.garden_id)
    .eq('user_id', user.id)
    .single()

  return (
    <InviteShell>
      <InviteCard gardenName={gardenName} inviterName={inviterName} roleLabel={roleLabel}>
        <InviteActions
          token={token}
          gardenId={invite.garden_id}
          alreadyMember={!!existingMembership}
        />
      </InviteCard>
    </InviteShell>
  )
}

// ---- Layout helpers ----

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-straw flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

function InviteCard({
  gardenName,
  inviterName,
  roleLabel,
  children,
}: {
  gardenName: string
  inviterName: string
  roleLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="card p-8 space-y-6">
      <div>
        <div className="w-12 h-12 bg-moss/10 rounded-2xl flex items-center justify-center mb-5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
               className="w-7 h-7 text-moss">
            <path d="M12 22V12" strokeLinecap="round"/>
            <path d="M12 12C12 12 6 8 6 4a6 6 0 0112 0c0 4-6 8-6 8z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="font-serif text-2xl text-soil mb-2">You&apos;ve been invited</h1>
        <p className="text-bark font-sans text-sm leading-relaxed">
          <strong className="text-soil">{inviterName}</strong> invited you to join{' '}
          <strong className="text-soil">{gardenName}</strong> as a{' '}
          <span className="text-moss font-medium">{roleLabel}</span>.
        </p>
      </div>
      {children}
    </div>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="card p-8 space-y-5">
      <div>
        <div className="w-12 h-12 bg-harvest/10 rounded-2xl flex items-center justify-center mb-5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
               className="w-6 h-6 text-harvest">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-bark font-sans text-sm leading-relaxed">{message}</p>
      </div>
      <Link href="/dashboard" className="text-sm font-sans text-moss hover:underline">
        ← Go to dashboard
      </Link>
    </div>
  )
}
