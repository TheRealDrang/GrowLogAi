import { createSupabaseServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/gardens/[id]/beds
// Returns distinct bed_location values for crops in this garden
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('crops')
    .select('bed_location')
    .eq('garden_id', id)
    .not('bed_location', 'is', null)
    .order('bed_location', { ascending: true })

  // Deduplicate in case of case-identical entries
  const beds = [...new Set((data ?? []).map(r => r.bed_location as string))].filter(Boolean)

  return NextResponse.json({ beds })
}
