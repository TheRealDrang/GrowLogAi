import { createSupabaseServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/onboarding/validate-sheet?url=xxx
// Pings the user's Apps Script URL to verify it's live and responding
export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  // Basic URL validation
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.endsWith('script.google.com')) {
      return NextResponse.json(
        { ok: false, error: 'URL must be a Google Apps Script web app URL.' },
        { status: 422 }
      )
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid URL.' }, { status: 422 })
  }

  try {
    // Claude chose this approach because: Google redirects headless server requests
    // to a login page; a browser User-Agent causes it to serve the script normally
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })

    const contentType = res.headers.get('content-type') ?? ''

    // If Google returned HTML, it's almost always a permissions/auth redirect
    if (contentType.includes('text/html')) {
      return NextResponse.json({
        ok: false,
        error: 'Google returned a login page instead of JSON. In your Apps Script deployment, make sure "Who has access" is set to "Anyone" (not "Anyone with Google account").',
      })
    }

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Sheet responded with status ${res.status}` })
    }

    let json: { ok?: boolean }
    try {
      json = await res.json()
    } catch {
      return NextResponse.json({
        ok: false,
        error: 'Sheet did not return JSON. Make sure you saved and deployed the script correctly.',
      })
    }

    if (json.ok === true) {
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'Script is reachable but did not return ok:true. Check that you pasted the full script and saved it.' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Connection failed'
    return NextResponse.json({ ok: false, error: msg })
  }
}
