/**
 * patch-sheet-photos.mjs
 *
 * Updates existing Google Sheet rows that are missing a photo link.
 * Reads each crop tab, matches rows by date + observation text, and
 * writes the Drive URL into column J (Photo Link).
 *
 * NO new rows are created. Only empty photo cells are filled in.
 *
 * Usage:
 *   node --env-file=.env.local scripts/patch-sheet-photos.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey         = process.env.SUPABASE_SERVICE_ROLE_KEY
const googleClientId     = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET

if (!supabaseUrl || !serviceKey || !googleClientId || !googleClientSecret) {
  console.error('Missing required env vars.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

// ── Google helpers ─────────────────────────────────────────────────────────────

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
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token refresh failed: ${err}`)
  }
  const data = await res.json()
  return data.access_token
}

// Read all rows from a sheet tab — returns array of arrays
async function readSheetTab(accessToken, spreadsheetId, tabTitle) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabTitle + '!A:J')}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Read failed for tab "${tabTitle}": ${err}`)
  }
  const data = await res.json()
  return data.values ?? []
}

// Update a single cell in the sheet (1-indexed row and col)
async function updateCell(accessToken, spreadsheetId, tabTitle, rowNum, colNum, value) {
  // Convert col number to letter (10 = J)
  const colLetter = String.fromCharCode(64 + colNum)
  const range = `${tabTitle}!${colLetter}${rowNum}`
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[value]] }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Cell update failed at ${range}: ${err}`)
  }
  return true
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════')
  console.log('  GrowLog AI — Patch Sheet Photo Links')
  console.log('══════════════════════════════════════════')
  console.log(`Database: ${supabaseUrl}\n`)

  // 1. All session_logs that have a drive_photo_url and were sheet_posted
  const { data: logs, error } = await supabase
    .from('session_logs')
    .select('id, crop_id, garden_id, crop_name, observation, created_at, drive_photo_url')
    .not('drive_photo_url', 'is', null)
    .eq('sheet_posted', true)
    .order('created_at', { ascending: true })

  if (error) { console.error('DB error:', error.message); process.exit(1) }
  console.log(`Session logs with Drive photo URL: ${logs?.length ?? 0}`)

  if (!logs?.length) {
    console.log('Nothing to patch.')
    return
  }

  // 2. Get garden config + owner refresh token (cache by garden_id)
  const gardenCache = {}
  async function getGardenConfig(gardenId) {
    if (gardenCache[gardenId] !== undefined) return gardenCache[gardenId]

    const { data: garden } = await supabase
      .from('gardens')
      .select('id, name, google_sheet_id, sheet_url')
      .eq('id', gardenId)
      .single()

    if (!garden?.google_sheet_id) {
      gardenCache[gardenId] = null
      return null
    }

    const { data: ownerRow } = await supabase
      .from('garden_members')
      .select('user_id')
      .eq('garden_id', gardenId)
      .eq('role', 'owner')
      .single()

    if (!ownerRow) { gardenCache[gardenId] = null; return null }

    const { data: tokenRow } = await supabase
      .from('user_google_tokens')
      .select('refresh_token')
      .eq('user_id', ownerRow.user_id)
      .single()

    if (!tokenRow?.refresh_token) { gardenCache[gardenId] = null; return null }

    gardenCache[gardenId] = { spreadsheetId: garden.google_sheet_id, refreshToken: tokenRow.refresh_token }
    return gardenCache[gardenId]
  }

  // 3. Cache access tokens per garden (refresh once, reuse)
  const accessTokenCache = {}
  async function getAccessToken(gardenId) {
    if (accessTokenCache[gardenId]) return accessTokenCache[gardenId]
    const config = await getGardenConfig(gardenId)
    if (!config) return null
    const token = await refreshAccessToken(config.refreshToken)
    accessTokenCache[gardenId] = token
    return token
  }

  // 4. Cache sheet tab contents per garden+tab (read once per tab)
  const tabCache = {}
  async function getTabRows(accessToken, spreadsheetId, tabTitle) {
    const key = `${spreadsheetId}::${tabTitle}`
    if (tabCache[key] !== undefined) return tabCache[key]
    const rows = await readSheetTab(accessToken, spreadsheetId, tabTitle)
    tabCache[key] = rows
    return rows
  }

  // 5. Process each log
  let patched = 0
  let skipped = 0
  let failed  = 0

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]
    const logDate = new Date(log.created_at).toISOString().split('T')[0]
    const prefix  = `[${i + 1}/${logs.length}]`

    try {
      const config = await getGardenConfig(log.garden_id)
      if (!config) {
        console.log(`${prefix} ⚠  No Google Sheet for garden — skipping ${log.crop_name}`)
        skipped++
        continue
      }

      const accessToken = await getAccessToken(log.garden_id)
      if (!accessToken) {
        console.log(`${prefix} ✗ Could not get access token for ${log.crop_name}`)
        failed++
        continue
      }

      // Read the crop's tab (cached after first read)
      const rows = await getTabRows(accessToken, config.spreadsheetId, log.crop_name)

      // Row 0 = header, data starts at row 1 (sheet row 2)
      // Match by: date (col A = index 0) + observation prefix (col E = index 4)
      // Only update if photo link (col J = index 9) is currently empty
      const obsNeedle = (log.observation ?? '').slice(0, 40).toLowerCase().trim()

      let matchedSheetRow = null
      for (let r = 1; r < rows.length; r++) {
        const rowDate  = (rows[r][0] ?? '').trim()
        const rowObs   = (rows[r][4] ?? '').toLowerCase().trim()
        const rowPhoto = (rows[r][9] ?? '').trim()

        if (rowDate !== logDate) continue
        if (!rowObs.startsWith(obsNeedle.slice(0, 20))) continue  // loose prefix match

        if (rowPhoto) {
          // Photo link already filled — skip (prevents overwrite)
          console.log(`${prefix} ✓ Already has photo — ${log.crop_name} (${logDate})`)
          skipped++
          matchedSheetRow = -1  // sentinel: found but skipped
          break
        }

        matchedSheetRow = r + 1  // convert to 1-indexed sheet row
        break
      }

      if (matchedSheetRow === null) {
        console.log(`${prefix} ⚠  No matching row in sheet — ${log.crop_name} (${logDate}) obs: "${obsNeedle.slice(0, 40)}"`)
        failed++
        continue
      }

      if (matchedSheetRow === -1) continue  // already had photo, counted above

      await updateCell(accessToken, config.spreadsheetId, log.crop_name, matchedSheetRow, 10, log.drive_photo_url)

      // Invalidate tab cache so subsequent logs for same tab see the update
      delete tabCache[`${config.spreadsheetId}::${log.crop_name}`]

      console.log(`${prefix} ✓ Patched — ${log.crop_name} (${logDate}) row ${matchedSheetRow}`)
      patched++

      await new Promise(r => setTimeout(r, 200))
    } catch (err) {
      console.error(`${prefix} ✗ Error on ${log.crop_name} (${logDate}): ${err.message}`)
      failed++
    }
  }

  console.log('\n══════════════════════════════════════════')
  console.log(`  Patch complete`)
  console.log(`  ✓ Patched:  ${patched}`)
  if (skipped > 0) console.log(`  ✓ Skipped (already had photo or no sheet): ${skipped}`)
  if (failed  > 0) console.log(`  ✗ Failed:   ${failed}`)
  console.log('══════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
