/**
 * recover-photo-links.mjs
 *
 * Finds session_logs that are missing a drive_photo_url but whose corresponding
 * user conversation message has one, and patches them up.
 *
 * The match chain:
 *   user conversation (has drive_photo_url)
 *     → assistant conversation for same crop_id within 10 min
 *       → session_log for same crop_id within 2 min of assistant message
 *
 * Usage:
 *   node --env-file=.env.local scripts/recover-photo-links.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)

const MATCH_WINDOW_MS = 120_000  // 2 min: session_log is created right after assistant message
const CONV_WINDOW_MS  = 600_000  // 10 min: assistant reply follows user message within this window

async function main() {
  console.log('\n══════════════════════════════════════════')
  console.log('  GrowLog AI — Recover Photo Links')
  console.log('══════════════════════════════════════════')
  console.log(`Database: ${supabaseUrl}\n`)

  // 1. All user conversation messages that have a Drive photo URL
  const { data: userConvsWithPhoto, error: e1 } = await supabase
    .from('conversations')
    .select('id, crop_id, created_at, drive_photo_url')
    .eq('role', 'user')
    .not('drive_photo_url', 'is', null)
    .order('created_at', { ascending: true })

  if (e1) { console.error('Error:', e1.message); process.exit(1) }
  console.log(`Found ${userConvsWithPhoto?.length ?? 0} user messages with Drive photo URLs`)

  if (!userConvsWithPhoto?.length) {
    console.log('No photos to recover.')
    return
  }

  // 2. All session_logs (we'll match against these)
  const { data: allLogs, error: e2 } = await supabase
    .from('session_logs')
    .select('id, crop_id, created_at, drive_photo_url, crop_name')
    .order('created_at', { ascending: true })

  if (e2) { console.error('Error:', e2.message); process.exit(1) }

  // 3. All assistant messages (bridge between user message and session_log timestamp)
  const { data: assistantConvs, error: e3 } = await supabase
    .from('conversations')
    .select('id, crop_id, created_at')
    .eq('role', 'assistant')
    .order('created_at', { ascending: true })

  if (e3) { console.error('Error:', e3.message); process.exit(1) }

  // 4. Match and patch
  let patched = 0
  let alreadyHad = 0
  let noMatch = 0

  for (const userConv of userConvsWithPhoto) {
    const userTime = new Date(userConv.created_at).getTime()

    // Find the assistant reply for this crop within CONV_WINDOW_MS after the user message
    const assistantReply = assistantConvs?.find(a =>
      a.crop_id === userConv.crop_id &&
      new Date(a.created_at).getTime() > userTime &&
      new Date(a.created_at).getTime() <= userTime + CONV_WINDOW_MS
    )

    if (!assistantReply) {
      const date = new Date(userConv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      console.log(`  ⚠  No assistant reply found for photo on ${date} (crop: ${userConv.crop_id})`)
      noMatch++
      continue
    }

    const assistantTime = new Date(assistantReply.created_at).getTime()

    // Find the session_log created within MATCH_WINDOW_MS after the assistant reply
    const matchingLog = allLogs?.find(log =>
      log.crop_id === userConv.crop_id &&
      new Date(log.created_at).getTime() >= assistantTime - 10_000 &&
      new Date(log.created_at).getTime() <= assistantTime + MATCH_WINDOW_MS
    )

    if (!matchingLog) {
      const date = new Date(userConv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      console.log(`  ⚠  No session log found for photo on ${date} (crop: ${userConv.crop_id})`)
      noMatch++
      continue
    }

    if (matchingLog.drive_photo_url) {
      alreadyHad++
      continue  // already linked, nothing to do
    }

    // Patch the session_log with the Drive URL
    const { error: updateError } = await supabase
      .from('session_logs')
      .update({ drive_photo_url: userConv.drive_photo_url })
      .eq('id', matchingLog.id)

    const date = new Date(userConv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (updateError) {
      console.error(`  ✗ Failed to patch ${matchingLog.crop_name} (${date}): ${updateError.message}`)
    } else {
      console.log(`  ✓ Linked photo → ${matchingLog.crop_name} (${date})`)
      patched++
    }
  }

  console.log('\n══════════════════════════════════════════')
  console.log(`  Photo recovery complete`)
  console.log(`  ✓ Patched:        ${patched}`)
  if (alreadyHad > 0) console.log(`  ✓ Already linked: ${alreadyHad}`)
  if (noMatch > 0)    console.log(`  ⚠  No match found: ${noMatch}`)
  console.log('══════════════════════════════════════════\n')

  if (noMatch > 0) {
    console.log('Note: "No match found" means either the session_log for that conversation')
    console.log('was never created (pre-June 9 entries that failed for a different reason),')
    console.log('or the timing gap between the photo message and AI reply exceeded 10 min.\n')
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
