import { createSupabaseServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/alerts — active, non-expired alerts for the current user
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date().toISOString()
  const { data: alerts } = await supabase
    .from('garden_alerts')
    .select('*, gardens(name), crops(name)')
    .eq('status', 'active')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('priority')
    .order('generated_at', { ascending: false })

  // Suppress unused variable warning — request is required by Next.js route signature
  void request

  return NextResponse.json({ alerts: alerts ?? [] })
}
