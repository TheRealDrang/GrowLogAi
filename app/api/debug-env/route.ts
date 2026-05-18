import { NextResponse } from 'next/server'

// TEMPORARY: debug endpoint to verify which Supabase project staging is using.
// Delete this file after confirming env vars are correct.
export async function GET() {
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'NOT SET',
    supabase_url_prefix: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').slice(0, 40),
  })
}
