import { createSupabaseAdminClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

// GET /api/alerts/opt-out?token=[userId]
// Linked from email digest footer — disables future digest emails for this user.
// Claude chose GET (not POST) because: this is triggered by clicking a link in an email client,
// which only supports GET requests.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return new Response('<html><body>Invalid unsubscribe link.</body></html>', {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const adminClient = createSupabaseAdminClient()
  // Claude chose this approach because: looking up by unsubscribe_token (a random UUID)
  // rather than user_id prevents anyone from unsubscribing arbitrary accounts by guessing IDs.
  await adminClient
    .from('profiles')
    .update({ digest_enabled: false })
    .eq('unsubscribe_token', token)

  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Unsubscribed — GrowLog AI</title>
</head>
<body style="margin:0;padding:40px 16px;background:#f5f0e8;font-family:Georgia,serif;text-align:center;">
  <p style="font-size:22px;color:#2c1810;">You've been unsubscribed.</p>
  <p style="font-size:15px;color:#5c4030;font-family:Arial,sans-serif;line-height:1.6;">
    You won't receive daily digest emails from GrowLog AI anymore.<br>
    You can re-enable them anytime in your <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}/settings" style="color:#3d5a3e;">settings</a>.
  </p>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
