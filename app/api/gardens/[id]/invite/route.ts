import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/gardens/[id]/invite
// Body: { email: string, role: 'edit' | 'view' }
// Sends an invite email and creates/refreshes the garden_invites row.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify requester is the garden owner
  const { data: membership } = await supabase
    .from('garden_members')
    .select('role')
    .eq('garden_id', id)
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .single()

  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const { email, role } = body

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }
  if (!['edit', 'view'].includes(role)) {
    return NextResponse.json({ error: 'role must be edit or view' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase().trim()

  // Get garden name and inviter display name for the email
  const [gardenResult, profileResult] = await Promise.all([
    supabase.from('gardens').select('name').eq('id', id).single(),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
  ])

  const gardenName = gardenResult.data?.name ?? 'the garden'
  const inviterName = profileResult.data?.display_name ?? user.email ?? 'A GrowLog member'

  // Upsert invite row — resets expiry and clears accepted_at on resend
  // Claude chose this approach because: upsert allows the owner to resend to the same email
  // without duplicates; accepted_at reset lets a re-invite work if the previous one expired
  const adminSupabase = createSupabaseAdminClient()
  const { data: invite, error: inviteError } = await adminSupabase
    .from('garden_invites')
    .upsert(
      {
        garden_id: id,
        invited_by: user.id,
        email: normalizedEmail,
        role,
        token: undefined,  // let DB generate a new token on insert; keep existing on update
        accepted_at: null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'garden_id,email', ignoreDuplicates: false }
    )
    .select('token')
    .single()

  if (inviteError || !invite) {
    return NextResponse.json({ error: 'Could not create invite' }, { status: 500 })
  }

  // Send invite email via Resend
  // RESEND_API_KEY must be set in .env.local — invite silently skips if missing
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invites/${invite.token}`
    const roleLabel = role === 'edit' ? 'edit' : 'view-only'

    await resend.emails.send({
      from: 'GrowLog AI <invites@growlogai.com>',
      to: normalizedEmail,
      subject: `${inviterName} invited you to join ${gardenName} on GrowLog`,
      html: buildInviteEmailHtml({ inviterName, gardenName, roleLabel, inviteUrl }),
    })
  }

  return NextResponse.json({ success: true })
}

function buildInviteEmailHtml({
  inviterName,
  gardenName,
  roleLabel,
  inviteUrl,
}: {
  inviterName: string
  gardenName: string
  roleLabel: string
  inviteUrl: string
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fffdf7;border-radius:16px;overflow:hidden;border:1px solid #e8e0d0;">
        <!-- Header -->
        <tr>
          <td style="background:#3d5a3e;padding:28px 36px;">
            <p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#f5f0e8;letter-spacing:-0.3px;">🌱 GrowLog AI</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 36px 28px;">
            <p style="margin:0 0 16px;font-size:22px;color:#2c1810;font-family:Georgia,serif;">You've been invited to a garden</p>
            <p style="margin:0 0 24px;font-size:15px;color:#5c4030;font-family:Arial,sans-serif;line-height:1.6;">
              <strong>${inviterName}</strong> has invited you to join <strong>${gardenName}</strong> on GrowLog AI
              as a <strong>${roleLabel}</strong> member.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#3d5a3e;border-radius:10px;padding:13px 28px;">
                  <a href="${inviteUrl}" style="color:#f5f0e8;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;">
                    Accept invitation →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:12px;color:#8a7060;font-family:Arial,sans-serif;line-height:1.6;">
              This link expires in 7 days. If you don't have a GrowLog account yet, you'll be able to create one when you follow the link.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f0ebe0;padding:16px 36px;border-top:1px solid #e8e0d0;">
            <p style="margin:0;font-size:11px;color:#a09080;font-family:Arial,sans-serif;">
              If you weren't expecting this invitation, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
