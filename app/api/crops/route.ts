import { createSupabaseServerClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

const MAX_CROPS_PER_GARDEN = 20

// GET /api/crops?garden_id=xxx — list crops for a garden
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gardenId = request.nextUrl.searchParams.get('garden_id')
  if (!gardenId) return NextResponse.json({ error: 'garden_id is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('crops')
    .select('*')
    .eq('garden_id', gardenId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/crops — create a crop (enforces 20-crop limit)
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { garden_id, name, variety, bed_location, sow_date, notes } = body

  if (!garden_id || !name) {
    return NextResponse.json({ error: 'garden_id and name are required' }, { status: 400 })
  }

  // Verify garden belongs to this user
  const { data: garden } = await supabase
    .from('gardens')
    .select('id')
    .eq('id', garden_id)
    .eq('user_id', user.id)
    .single()

  if (!garden) {
    return NextResponse.json({ error: 'Garden not found' }, { status: 404 })
  }

  // Enforce 20-crop limit
  const { count } = await supabase
    .from('crops')
    .select('id', { count: 'exact', head: true })
    .eq('garden_id', garden_id)
    .eq('user_id', user.id)

  if ((count ?? 0) >= MAX_CROPS_PER_GARDEN) {
    return NextResponse.json(
      { error: `Each garden can have a maximum of ${MAX_CROPS_PER_GARDEN} crops.` },
      { status: 422 }
    )
  }

  const { data, error } = await supabase
    .from('crops')
    .insert({
      garden_id,
      user_id: user.id,
      name: name.trim(),
      variety: variety?.trim() || null,
      bed_location: bed_location?.trim() || null,
      sow_date: sow_date || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
