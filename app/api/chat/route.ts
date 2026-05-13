import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { anthropic, buildSystemPrompt, trimHistory } from '@/lib/anthropic'
import { fetchWeather } from '@/lib/weather'
import { extractSessionLog } from '@/lib/session-extractor'
import { postToSheet } from '@/lib/sheet-logger'
import { refreshAccessToken, appendToSheet } from '@/lib/google-sheets'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/chat
// Body: { crop_id: string, message: string }
// Returns: streaming text response
export async function POST(request: NextRequest) {
  try {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { crop_id, message, image } = body

  if (!crop_id || (!message && !image)) {
    return NextResponse.json({ error: 'crop_id and message or image are required' }, { status: 400 })
  }

  // Load crop + garden details — RLS verifies the user is a garden member
  const { data: crop, error: cropError } = await supabase
    .from('crops')
    .select('*, gardens(id, name, location, usda_zone, latitude, longitude, sheet_url, google_sheet_id)')
    .eq('id', crop_id)
    .single()

  if (cropError || !crop) {
    return NextResponse.json({ error: 'Crop not found' }, { status: 404 })
  }

  const garden = crop.gardens as {
    id: string
    name: string
    location: string | null
    usda_zone: string | null
    latitude: number | null
    longitude: number | null
    sheet_url: string | null
    google_sheet_id: string | null
  }

  // Fetch conversation history for all members of this crop's garden
  const { data: rawHistory } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('crop_id', crop_id)
    .order('created_at', { ascending: true })

  const history = trimHistory(rawHistory ?? [])

  // Save the user's message immediately (images are not stored — too large for DB)
  const savedContent = image ? (message ? `[Photo] ${message}` : '[Photo attached]') : message
  await supabase.from('conversations').insert({
    crop_id,
    created_by: user.id,
    role: 'user',
    content: savedContent,
  })

  // Fetch weather if garden has coordinates
  const weather =
    garden.latitude && garden.longitude
      ? await fetchWeather(garden.latitude, garden.longitude)
      : null

  // Build system prompt
  const systemPrompt = buildSystemPrompt(
    {
      name: garden.name,
      location: garden.location,
      usdaZone: garden.usda_zone,
    },
    {
      name: crop.name,
      variety: crop.variety,
      bedLocation: crop.bed_location,
      sowDate: crop.sow_date,
      status: crop.status,
      notes: crop.notes,
    },
    weather
  )

  // Stream response from Anthropic
  const stream = anthropic.messages.stream({
    model: process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      {
        role: 'user' as const,
        // Claude chose this approach because: vision API requires content array when image is present
        content: image
          ? [
              { type: 'image' as const, source: { type: 'base64' as const, media_type: image.mediaType as 'image/jpeg', data: image.data } },
              { type: 'text' as const, text: message || `Please analyze this photo of my ${crop.name} and share any observations or advice.` },
            ]
          : message,
      },
    ],
  })

  // Collect the full text as we stream, then do post-processing
  let fullText = ''

  const readableStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      stream.on('text', (text) => {
        fullText += text
        controller.enqueue(encoder.encode(text))
      })

      stream.on('error', (err) => {
        controller.error(err)
      })

      stream.on('finalMessage', async () => {
        try {
        // Extract the session log JSON from the tail of the response
        // Claude chose this approach because: controller.close() is called last so
        // Next.js 16 doesn't terminate the function before DB/sheet writes complete
        const { cleanText, log } = extractSessionLog(fullText)

        // Save assistant message (clean version — no json block)
        await supabase.from('conversations').insert({
          crop_id,
          created_by: user.id,
          role: 'assistant',
          content: cleanText,
        })

        // Insert session log row
        let sessionLogId: string | null = null
        if (log) {
          const { data: logRow } = await supabase
            .from('session_logs')
            .insert({
              crop_id,
              created_by: user.id,
              garden_id: garden.id,
              crop_name: crop.name,
              garden_name: garden.name,
              observation: log.observation,
              action_taken: log.action_taken,
              ai_advice: log.ai_advice,
              weather_summary: log.weather_summary,
              sheet_posted: false,
              raw_json: log,
              full_response: cleanText,
            })
            .select('id')
            .single()

          sessionLogId = logRow?.id ?? null
        }

        // Post to sheet (fire-and-forget) — prefer Sheets API for Google users,
        // fall back to Apps Script for email users with a manual URL configured
        if (log && sessionLogId) {
          const rowData = {
            log_date: new Date().toISOString().split('T')[0],
            crop_name: crop.name,
            variety: crop.variety ?? '',
            bed_location: crop.bed_location ?? '',
            observation: log.observation,
            action_taken: log.action_taken,
            ai_advice: log.ai_advice,
            weather_summary: log.weather_summary,
            full_response: cleanText,
          }

          if (garden.google_sheet_id) {
            // Sheet logging always uses the garden owner's credentials, regardless of which member chatted.
            // Admin client is required because RLS blocks members from reading another user's token.
            const { data: ownerRow } = await supabase
              .from('garden_members')
              .select('user_id')
              .eq('garden_id', garden.id)
              .eq('role', 'owner')
              .single()
            const { data: tokenRow } = await createSupabaseAdminClient()
              .from('user_google_tokens')
              .select('refresh_token')
              .eq('user_id', ownerRow?.user_id ?? user.id)
              .single()

            if (tokenRow?.refresh_token) {
              const accessToken = await refreshAccessToken(tokenRow.refresh_token)
              if (accessToken) {
                const posted = await appendToSheet(
                  accessToken,
                  garden.google_sheet_id,
                  crop.name,
                  rowData
                )
                if (sessionLogId) {
                  supabase
                    .from('session_logs')
                    .update({ sheet_posted: posted })
                    .eq('id', sessionLogId)
                    .then(() => {})
                }
              }
            }
          } else if (garden.sheet_url) {
            // Email user with manually configured Apps Script URL
            postToSheet(garden.sheet_url, {
              token: process.env.SHEET_SECRET_TOKEN ?? '',
              garden_name: garden.name,
              ...rowData,
            }).then((posted) => {
              if (sessionLogId) {
                supabase
                  .from('session_logs')
                  .update({ sheet_posted: posted })
                  .eq('id', sessionLogId)
                  .then(() => {})
              }
            })
          }
        }

        // Summarize and compress history if it has grown beyond 20 turns
        const { count } = await supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('crop_id', crop_id)

        if ((count ?? 0) > 20) {
          // Oldest 10 messages are summarized into crop notes
          const { data: oldest } = await supabase
            .from('conversations')
            .select('role, content, id')
            .eq('crop_id', crop_id)
            .order('created_at', { ascending: true })
            .limit(10)

          if (oldest && oldest.length > 0) {
            const summary = oldest
              .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
              .join('\n')

            const newNotes = `[Earlier conversation summary]\n${summary}\n\n${crop.notes ?? ''}`

            await supabase
              .from('crops')
              .update({ notes: newNotes.slice(0, 2000) })
              .eq('id', crop_id)

            // Delete the summarized messages
            const ids = oldest.map(m => m.id)
            await supabase.from('conversations').delete().in('id', ids)
          }
        }

        controller.close()
        } catch (finalErr) {
          console.error('[chat finalMessage error]', finalErr)
          controller.close()
        }
      })
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
  } catch (err) {
    console.error('[/api/chat error]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
