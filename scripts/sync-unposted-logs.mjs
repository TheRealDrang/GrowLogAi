/**
 * sync-unposted-logs.mjs
 *
 * Pushes all session_logs with sheet_posted=false to Google Sheets.
 * Intended to recover the 23 entries that were written to Supabase by
 * recover-session-logs.mjs but never synced to the sheet.
 *
 * Usage:
 *   node --env-file=.env.local scripts/sync-unposted-logs.mjs
 *
 * (Runs against whichever Supabase project NEXT_PUBLIC_SUPABASE_URL points to.)
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY
const googleClientId     = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

if (!supabaseUrl || !serviceKey || !googleClientId || !googleClientSecret) {
  console.error('Missing required env vars.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

// ── Google helpers (mirrors lib/google-sheets.ts) ─────────────────────────────

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     googleClientId,
      client_secret: googleClientSecret,
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.access_token ?? null
}

async function appendToSheet(accessToken, spreadsheetId, sheetTitle, row) {
  const values = [
    row.log_date,
    row.crop_name,
    row.variety,
    row.bed_location,
    row.observation,
    row.action_taken,
    row.ai_advice,
    row.weather_summary,
    row.full_response,
    row.photo_url ?? '',
  ]

  const HEADERS = ['Date', 'Crop', 'Variety', 'Bed', 'Observation', 'Action Taken', 'AI Advice', 'Weather', 'Full Response', 'Photo Link']
  const rangeUrl = (range) =>
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`

  // Try appending to existing tab
  const appendRes = await fetch(rangeUrl(`${sheetTitle}!A1`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  })
  if (appendRes.ok) return true

  // Tab doesn't exist — create it first
  const addRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetTitle } } }] }),
    }
  )
  if (!addRes.ok) return false

  // Write header + data
  const writeRes = await fetch(rangeUrl(`${sheetTitle}!A1`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [HEADERS, values] }),
  })
  return writeRes.ok
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════')
  console.log('  GrowLog AI — Sync Unposted Logs to Sheet')
  console.log('══════════════════════════════════════════')
  console.log(`Database: ${supabaseUrl}\n`)

  // 1. Find all session_logs where sheet_posted = false
  const { data: unposted, error } = await supabase
    .from('session_logs')
    .select('id, crop_id, garden_id, crop_name, garden_name, observation, action_taken, ai_advice, weather_summary, full_response, drive_photo_url, created_at')
    .eq('sheet_posted', false)
    .order('created_at', { ascending: true })

  if (error) { console.error('Error fetching unposted logs:', error.message); process.exit(1) }
  console.log(`Found ${unposted?.length ?? 0} unposted session logs\n`)

  if (!unposted?.length) {
    console.log('Nothing to sync.')
    return
  }

  // 2. Get the garden's sheet config and owner refresh token (cache by garden_id)
  const gardenCache = {}

  async function getGardenConfig(gardenId) {
    if (gardenCache[gardenId]) return gardenCache[gardenId]

    const { data: garden } = await supabase
      .from('gardens')
      .select('id, name, google_sheet_id, sheet_url')
      .eq('id', gardenId)
      .single()

    if (!garden) { gardenCache[gardenId] = null; return null }

    let refreshToken = null
    if (garden.google_sheet_id) {
      // Get the garden owner's refresh token
      const { data: ownerRow } = await supabase
        .from('garden_members')
        .select('user_id')
        .eq('garden_id', gardenId)
        .eq('role', 'owner')
        .single()

      if (ownerRow) {
        const { data: tokenRow } = await supabase
          .from('user_google_tokens')
          .select('refresh_token')
          .eq('user_id', ownerRow.user_id)
          .single()
        refreshToken = tokenRow?.refresh_token ?? null
      }
    }

    const config = { ...garden, refreshToken }
    gardenCache[gardenId] = config
    return config
  }

  // 3. Also get crop variety/bed for each unique crop_id (cache)
  const cropCache = {}

  async function getCropDetails(cropId) {
    if (cropCache[cropId]) return cropCache[cropId]
    const { data: crop } = await supabase
      .from('crops')
      .select('variety, bed_location')
      .eq('id', cropId)
      .single()
    cropCache[cropId] = { variety: crop?.variety ?? '', bed_location: crop?.bed_location ?? '' }
    return cropCache[cropId]
  }

  // 4. Sync each entry
  let synced = 0
  let failed = 0

  for (let i = 0; i < unposted.length; i++) {
    const log = unposted[i]
    const prefix = `[${i + 1}/${unposted.length}]`
    const date = new Date(log.created_at).toISOString().split('T')[0]

    try {
      const garden = await getGardenConfig(log.garden_id)
      if (!garden) {
        console.log(`${prefix} ✗ Garden not found — skipping`)
        failed++
        continue
      }

      const crop = await getCropDetails(log.crop_id)

      const rowData = {
        log_date:        date,
        crop_name:       log.crop_name ?? '',
        variety:         crop.variety,
        bed_location:    crop.bed_location,
        observation:     log.observation ?? '',
        action_taken:    log.action_taken ?? '',
        ai_advice:       log.ai_advice ?? '',
        weather_summary: log.weather_summary ?? '',
        full_response:   log.full_response ?? '',
        photo_url:       log.drive_photo_url ?? '',
      }

      let posted = false

      if (garden.google_sheet_id && garden.refreshToken) {
        const accessToken = await refreshAccessToken(garden.refreshToken)
        if (accessToken) {
          posted = await appendToSheet(accessToken, garden.google_sheet_id, log.crop_name, rowData)
        } else {
          console.log(`${prefix} ✗ Could not refresh Google token for ${log.crop_name}`)
          failed++
          continue
        }
      } else if (garden.sheet_url) {
        // Old webhook approach
        const res = await fetch(garden.sheet_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: process.env.SHEET_SECRET_TOKEN ?? '',
            garden_name: log.garden_name ?? '',
            ...rowData,
          }),
        })
        posted = res.ok
      } else {
        console.log(`${prefix} ✗ No sheet configured for garden "${garden.name}"`)
        failed++
        continue
      }

      if (posted) {
        // Mark as synced in Supabase
        await supabase
          .from('session_logs')
          .update({ sheet_posted: true })
          .eq('id', log.id)
        console.log(`${prefix} ✓ ${log.crop_name} (${date}) → sheet`)
        synced++
      } else {
        console.log(`${prefix} ✗ Sheet write failed for ${log.crop_name} (${date})`)
        failed++
      }

      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      console.error(`${prefix} ✗ Error: ${err.message}`)
      failed++
    }
  }

  console.log('\n══════════════════════════════════════════')
  console.log(`  Sync complete`)
  console.log(`  ✓ Synced: ${synced}`)
  if (failed > 0) console.log(`  ✗ Failed: ${failed}`)
  console.log('══════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
