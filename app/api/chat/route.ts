import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase'
import { anthropic, buildSystemPrompt, trimHistory } from '@/lib/anthropic'
import { fetchWeather } from '@/lib/weather'
import { extractSessionLog, type SessionLog } from '@/lib/session-extractor'
import { postToSheet } from '@/lib/sheet-logger'
import { refreshAccessToken, appendToSheet, type SheetRowData } from '@/lib/google-sheets'
import { getOrCreateGrowLogFolder, uploadImageToDrive, buildDriveFilename } from '@/lib/google-drive'
import { after, NextRequest, NextResponse } from 'next/server'

const CHAT_HISTORY_LIMIT = 20

interface ChatGarden {
  id: string
  name: string
  location: string | null
  usda_zone: string | null
  latitude: number | null
  longitude: number | null
  sheet_url: string | null
  google_sheet_id: string | null
  drive_folder_id: string | null
}

interface ChatCrop {
  id: string
  name: string
  variety: string | null
  bed_location: string | null
  notes: string | null
}

async function acknowledgeCropAlerts(userId: string, cropId: string) {
  await createSupabaseAdminClient()
    .from('garden_alerts')
    .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
    .eq('crop_id', cropId)
    .eq('user_id', userId)
    .eq('status', 'active')
}

async function syncSessionLogToSheet(
  userId: string,
  garden: ChatGarden,
  crop: ChatCrop,
  log: SessionLog,
  cleanText: string,
  sessionLogId: string
) {
  const rowData: SheetRowData = {
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

  const adminSupabase = createSupabaseAdminClient()
  let posted = false

  if (garden.google_sheet_id) {
    // Codex chose this approach because: post-response work should avoid request cookies, so privileged sheet sync uses the admin client with explicit IDs.
    const { data: ownerRow } = await adminSupabase
      .from('garden_members')
      .select('user_id')
      .eq('garden_id', garden.id)
      .eq('role', 'owner')
      .single()

    const { data: tokenRow } = await adminSupabase
      .from('user_google_tokens')
      .select('refresh_token')
      .eq('user_id', ownerRow?.user_id ?? userId)
      .single()

    if (tokenRow?.refresh_token) {
      const accessToken = await refreshAccessToken(tokenRow.refresh_token)
      if (accessToken) {
        posted = await appendToSheet(accessToken, garden.google_sheet_id, crop.name, rowData)
      }
    }
  } else if (garden.sheet_url) {
    posted = await postToSheet(garden.sheet_url, {
      token: process.env.SHEET_SECRET_TOKEN ?? '',
      garden_name: garden.name,
      ...rowData,
    })
  }

  await adminSupabase
    .from('session_logs')
    .update({ sheet_posted: posted })
    .eq('id', sessionLogId)
}

async function compressConversationHistory(cropId: string, cropNotes: string | null) {
  const adminSupabase = createSupabaseAdminClient()
  const { count } = await adminSupabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('crop_id', cropId)

  if ((count ?? 0) <= 20) return

  const { data: oldest } = await adminSupabase
    .from('conversations')
    .select('role, content, id')
    .eq('crop_id', cropId)
    .order('created_at', { ascending: true })
    .limit(10)

  if (!oldest || oldest.length === 0) return

  const summary = oldest
    .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n')

  const newNotes = `[Earlier conversation summary]\n${summary}\n\n${cropNotes ?? ''}`

  await adminSupabase
    .from('crops')
    .update({ notes: newNotes.slice(0, 2000) })
    .eq('id', cropId)

  const ids = oldest.map(m => m.id)
  await adminSupabase.from('conversations').delete().in('id', ids)
}

// POST /api/chat
// Body: { crop_id: string, message: string }
// Returns: streaming text response
export async function POST(request: NextRequest) {
  try {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { crop_id, message, image, alertContext } = body

  if (!crop_id || (!message && !image)) {
    return NextResponse.json({ error: 'crop_id and message or image are required' }, { status: 400 })
  }

  // Load crop + garden details — RLS verifies the user is a garden member
  const { data: crop, error: cropError } = await supabase
    .from('crops')
    .select('*, gardens(id, name, location, usda_zone, latitude, longitude, sheet_url, google_sheet_id, drive_folder_id)')
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
    drive_folder_id: string | null
  }

  // Fetch conversation history for all members of this crop's garden
  const { data: rawHistory } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('crop_id', crop_id)
    .order('created_at', { ascending: false })
    .limit(CHAT_HISTORY_LIMIT)

  // Codex chose this approach because: fetching only recent messages keeps long-running crop chats fast while preserving chronological prompt order.
  const history = trimHistory((rawHistory ?? []).reverse())

  // Fetch recent session logs to use as compressed history context in the system prompt
  const { data: recentLogs } = await supabase
    .from('session_logs')
    .select('log_date, observation, action_taken, ai_advice, weather_summary')
    .eq('crop_id', crop_id)
    .order('created_at', { ascending: false })
    .limit(8)

  const sessionLogs = (recentLogs ?? []).reverse()

  // Save the user's message immediately (images are not stored — too large for DB)
  const savedContent = image ? (message ? `[Photo] ${message}` : '[Photo attached]') : message
  const { data: userConvRow } = await supabase.from('conversations').insert({
    crop_id,
    created_by: user.id,
    role: 'user',
    content: savedContent,
  }).select('id').single()
  const userConvId: string | null = userConvRow?.id ?? null

  // Pre-fetch garden owner's Google refresh token for Drive upload (only when a photo is attached)
  // Claude chose this approach because: Drive upload happens inside the stream callback where
  // the request-scoped client may have issues, so we resolve the token before streaming starts.
  let ownerDriveRefreshToken: string | null = null
  if (image) {
    const adminSupabase = createSupabaseAdminClient()
    const { data: ownerRow } = await adminSupabase
      .from('garden_members')
      .select('user_id')
      .eq('garden_id', garden.id)
      .eq('role', 'owner')
      .single()
    const { data: tokenRow } = await adminSupabase
      .from('user_google_tokens')
      .select('refresh_token')
      .eq('user_id', ownerRow?.user_id ?? user.id)
      .single()
    ownerDriveRefreshToken = tokenRow?.refresh_token ?? null
  }

  // Fetch weather if garden has coordinates
  const weather =
    garden.latitude && garden.longitude
      ? await fetchWeather(garden.latitude, garden.longitude)
      : null

  // Build system prompt, appending alert context if provided
  const baseSystemPrompt = buildSystemPrompt(
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
    weather,
    sessionLogs
  )

  // If the user tapped an Advisor Note, append its context to guide the first reply
  const systemPrompt = alertContext
    ? baseSystemPrompt + `\n\n## Alert Context\n${alertContext}`
    : baseSystemPrompt

  // Stream response from Anthropic
  const stream = anthropic.messages.stream({
    model: process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-haiku-4-5-20251001',
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
        console.error('[chat stream error]', err)
        controller.error(err)
      })

      stream.on('finalMessage', async () => {
        try {
        // Extract the session log JSON from the tail of the response
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

        // Upload photo to Drive if one was attached and we have a valid token
        if (image && ownerDriveRefreshToken) {
          try {
            const accessToken = await refreshAccessToken(ownerDriveRefreshToken)
            if (accessToken) {
              const folderId = await getOrCreateGrowLogFolder(
                accessToken,
                garden.name,
                garden.id,
                garden.drive_folder_id
              )
              if (folderId) {
                const filename = buildDriveFilename(crop.name, log?.observation ?? null)
                const driveUrl = await uploadImageToDrive(accessToken, image.data, filename, folderId)
                if (driveUrl) {
                  // Persist the Drive URL on the user's conversation row
                  if (userConvId) {
                    await createSupabaseAdminClient()
                      .from('conversations')
                      .update({ drive_photo_url: driveUrl })
                      .eq('id', userConvId)
                  }
                  // Append the Drive URL marker so the client can surface the link
                  controller.enqueue(encoder.encode(`\n\n[DRIVE_URL:${driveUrl}]`))
                }
              }
            }
          } catch (driveErr) {
            // Drive failure is non-fatal — chat succeeds regardless
            console.error('[drive upload error]', driveErr)
          }
        }

        // Codex chose this approach because: the user should receive the finished chat response before slower sheet sync and cleanup work runs.
        after(async () => {
          try {
            await Promise.all([
              log ? acknowledgeCropAlerts(user.id, crop_id) : Promise.resolve(),
              log && sessionLogId
                ? syncSessionLogToSheet(user.id, garden, crop, log, cleanText, sessionLogId)
                : Promise.resolve(),
              compressConversationHistory(crop_id, crop.notes),
            ])
          } catch (backgroundErr) {
            console.error('[chat after-response work error]', backgroundErr)
          }
        })

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
