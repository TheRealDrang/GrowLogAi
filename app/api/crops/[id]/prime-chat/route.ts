import { createSupabaseServerClient } from '@/lib/supabase'
import { anthropic } from '@/lib/anthropic'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/crops/[id]/prime-chat
// Generates a warm welcome message from the AI advisor and stores it in conversations.
// Called once after first crop creation during onboarding.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch crop and garden — RLS verifies the user is a garden member
  const { data: crop } = await supabase
    .from('crops')
    .select('*, gardens(name, location, usda_zone)')
    .eq('id', id)
    .single()

  if (!crop) return NextResponse.json({ error: 'Crop not found' }, { status: 404 })

  const garden = crop.gardens as { name: string; location: string | null; usda_zone: string | null }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Build context-aware welcome prompt
  let sowContext = ''
  if (crop.sow_date) {
    const daysSinceSow = Math.floor((today.getTime() - new Date(crop.sow_date).getTime()) / 86400000)
    sowContext = `The crop was sown ${daysSinceSow} days ago (${crop.sow_date}). Mention something stage-appropriate for a ${crop.name} at this age.`
  } else {
    sowContext = `No sow date has been recorded yet. Gently invite the grower to add it so you can give more tailored advice.`
  }

  const prompt = `You are GrowLog AI, a warm and knowledgeable vegetable gardening advisor. Today is ${todayStr}.

Garden: ${garden.name}${garden.location ? ` (${garden.location})` : ''}${garden.usda_zone ? `, Zone ${garden.usda_zone}` : ''}
Crop: ${crop.name}${crop.variety ? ` — ${crop.variety}` : ''}${crop.bed_location ? `, in ${crop.bed_location}` : ''}
${crop.notes ? `Grower's notes: ${crop.notes}` : ''}

${sowContext}

Write a welcome message (2–3 sentences) that:
- Greets the grower warmly and shows you know what crop they're growing
- Offers one brief, practical observation or tip relevant to this crop right now
- Ends with an open invitation for them to share what's going on

Keep it friendly and concise. Do not add a JSON log block — this is a greeting, not a session log.`

  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_BACKGROUND_MODEL ?? 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })

  const message = (response.content[0] as { type: 'text'; text: string }).text

  // Store as the first assistant message in conversations
  await supabase.from('conversations').insert({
    crop_id: id,
    created_by: user.id,
    role: 'assistant',
    content: message,
  })

  return NextResponse.json({ message })
}
