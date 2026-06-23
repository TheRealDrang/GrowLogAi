/**
 * recover-session-logs.mjs
 *
 * Recovers missing session_logs for assistant conversations since June 9, 2026.
 *
 * Root cause: The June 9 code deploy added `followup_days` to the session_log
 * insert, but migration 008 (which adds that column) was never applied to
 * production. Every insert silently failed — conversations were saved but no
 * journal entries were created.
 *
 * This script:
 *   1. Finds all assistant conversations since June 9 with no matching session_log
 *   2. Uses Claude Haiku to extract journal fields from each conversation
 *   3. Inserts the recovered entries into the session_logs table
 *
 * Usage:
 *   node --env-file=.env.production.local scripts/recover-session-logs.mjs
 *
 * .env.production.local needs these values (get the key from Vercel dashboard):
 *   NEXT_PUBLIC_SUPABASE_URL=https://yaoegpthgwmvptyjbgpl.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service role key>
 *   ANTHROPIC_API_KEY=<anthropic api key>
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { createInterface } from 'readline'

// ── Config ────────────────────────────────────────────────────────────────────

const CUTOFF_DATE = '2026-06-09T00:00:00.000Z'
// Window to match a session_log to an assistant message (in ms)
// Session log is created immediately after the assistant message, so 2 min is plenty
const MATCH_WINDOW_MS = 120_000

// ── Setup ─────────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY

if (!supabaseUrl || !serviceKey || !anthropicKey) {
  console.error('\n❌  Missing required environment variables.')
  console.error('    NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗ MISSING')
  console.error('    SUPABASE_SERVICE_ROLE_KEY:', serviceKey ? '✓' : '✗ MISSING')
  console.error('    ANTHROPIC_API_KEY:', anthropicKey ? '✓' : '✗ MISSING')
  console.error('\n    Create .env.production.local with these values and re-run.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey)
const anthropic = new Anthropic({ apiKey: anthropicKey })

const AUTO_YES = process.argv.includes('--yes')

// ── Helpers ───────────────────────────────────────────────────────────────────

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function confirm(question) {
  if (AUTO_YES) { console.log(question + ' (y/n): y'); return true }
  const answer = await prompt(question + ' (y/n): ')
  return answer.toLowerCase().startsWith('y')
}

/**
 * Ask Claude Haiku to extract journal fields from a conversation pair.
 */
async function extractLogFields(userMessage, aiResponse) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You are extracting a structured garden journal entry from a conversation. Return valid JSON only — no explanation.

User's message: "${userMessage.slice(0, 800)}"

AI response: "${aiResponse.slice(0, 1200)}"

Return this JSON:
{
  "observation": "one sentence: what the gardener observed or asked about",
  "action_taken": "one sentence: what they did or plan to do (empty string if nothing mentioned)",
  "ai_advice": "one sentence: the core advice given in the AI response",
  "confidence": "high"
}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Could not parse Claude response: ${text.slice(0, 200)}`)
  return JSON.parse(match[0])
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════')
  console.log('  GrowLog AI — Session Log Recovery')
  console.log('══════════════════════════════════════════')
  console.log(`\nDatabase: ${supabaseUrl}`)
  console.log(`Recovering entries since: ${CUTOFF_DATE}\n`)

  const isProduction = supabaseUrl.includes('yaoegpthgwmvptyjbgpl')
  if (!isProduction) {
    console.warn('⚠️  WARNING: This does not look like the production database.')
    console.warn(`   URL: ${supabaseUrl}`)
    const ok = await confirm('   Continue anyway?')
    if (!ok) { console.log('Aborting.'); process.exit(0) }
  } else {
    const ok = await confirm('This will write to PRODUCTION. Are you sure?')
    if (!ok) { console.log('Aborting.'); process.exit(0) }
  }

  // ── Step 1: Fetch all assistant messages since June 9 ─────────────────────
  console.log('\n[1/4] Fetching assistant conversations since June 9...')
  const { data: assistantMsgs, error: e1 } = await supabase
    .from('conversations')
    .select('id, crop_id, created_by, content, created_at')
    .eq('role', 'assistant')
    .gte('created_at', CUTOFF_DATE)
    .order('created_at', { ascending: true })

  if (e1) { console.error('Error fetching conversations:', e1.message); process.exit(1) }
  console.log(`   Found ${assistantMsgs?.length ?? 0} assistant messages`)

  if (!assistantMsgs?.length) {
    console.log('\nNo conversations found since June 9. Nothing to recover.')
    return
  }

  // ── Step 2: Fetch existing session_logs since June 9 ─────────────────────
  console.log('\n[2/4] Fetching existing session logs...')
  const { data: existingLogs, error: e2 } = await supabase
    .from('session_logs')
    .select('id, crop_id, created_at')
    .gte('created_at', CUTOFF_DATE)

  if (e2) { console.error('Error fetching session_logs:', e2.message); process.exit(1) }
  console.log(`   Found ${existingLogs?.length ?? 0} existing session logs`)

  // ── Step 3: Find orphaned conversations ──────────────────────────────────
  console.log('\n[3/4] Identifying orphaned conversations...')
  const orphaned = assistantMsgs.filter(msg => {
    const msgTime = new Date(msg.created_at).getTime()
    return !(existingLogs ?? []).some(log =>
      log.crop_id === msg.crop_id &&
      new Date(log.created_at).getTime() >= msgTime - 10_000 &&   // 10s before (clock skew buffer)
      new Date(log.created_at).getTime() <= msgTime + MATCH_WINDOW_MS
    )
  })

  console.log(`   Orphaned (no matching session log): ${orphaned.length}`)

  if (orphaned.length === 0) {
    console.log('\n✅  Nothing to recover — all conversations already have session logs.')
    return
  }

  // Show a preview of what will be recovered
  console.log('\n   Preview (first 5):')
  for (const msg of orphaned.slice(0, 5)) {
    const date = new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const preview = msg.content.slice(0, 80).replace(/\n/g, ' ')
    console.log(`   • ${date} — ${preview}...`)
  }
  if (orphaned.length > 5) {
    console.log(`   • ... and ${orphaned.length - 5} more`)
  }

  const proceed = await confirm(
    `\nRecover ${orphaned.length} session logs? (~${orphaned.length} Claude Haiku calls)`
  )
  if (!proceed) { console.log('Aborting.'); process.exit(0) }

  // ── Step 4: Recover each orphaned message ─────────────────────────────────
  console.log('\n[4/4] Recovering session logs...\n')
  let recovered = 0
  let failed = 0

  for (let i = 0; i < orphaned.length; i++) {
    const msg = orphaned[i]
    const prefix = `   [${i + 1}/${orphaned.length}]`

    try {
      // Get the user message immediately preceding this assistant message
      const { data: userMsgs } = await supabase
        .from('conversations')
        .select('content')
        .eq('crop_id', msg.crop_id)
        .eq('role', 'user')
        .lt('created_at', msg.created_at)
        .order('created_at', { ascending: false })
        .limit(1)

      const userMessage = userMsgs?.[0]?.content ?? '(no user message found)'

      // Get crop + garden context
      const { data: crop } = await supabase
        .from('crops')
        .select('name, variety, gardens(id, name)')
        .eq('id', msg.crop_id)
        .single()

      if (!crop) {
        console.log(`${prefix} ✗ Skipping — crop not found (id: ${msg.crop_id})`)
        failed++
        continue
      }

      const garden = crop.gardens

      // Extract journal fields using Claude
      const extracted = await extractLogFields(userMessage, msg.content)

      // Insert the recovered session log, preserving the original timestamp
      const { error: insertError } = await supabase
        .from('session_logs')
        .insert({
          crop_id:        msg.crop_id,
          created_by:     msg.created_by,
          garden_id:      garden.id,
          crop_name:      crop.name,
          garden_name:    garden.name,
          observation:    extracted.observation ?? '',
          action_taken:   extracted.action_taken ?? '',
          ai_advice:      extracted.ai_advice ?? '',
          weather_summary: '',
          followup_days:  0,
          sheet_posted:   false,
          raw_json:       extracted,
          full_response:  msg.content,
          created_at:     msg.created_at,   // preserve original conversation timestamp
        })

      if (insertError) {
        console.error(`${prefix} ✗ Insert failed (${crop.name}): ${insertError.message}`)
        failed++
      } else {
        const date = new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        console.log(`${prefix} ✓ ${crop.name} (${date}) — "${extracted.observation.slice(0, 60)}"`)
        recovered++
      }

      // Small delay to avoid hammering the Anthropic API
      await new Promise(r => setTimeout(r, 400))
    } catch (err) {
      console.error(`${prefix} ✗ Error: ${err.message}`)
      failed++
    }
  }

  console.log('\n══════════════════════════════════════════')
  console.log(`  Recovery complete`)
  console.log(`  ✓ Recovered: ${recovered}`)
  if (failed > 0) console.log(`  ✗ Failed:    ${failed}`)
  console.log('══════════════════════════════════════════\n')

  if (recovered > 0) {
    console.log('Journal entries are now visible in the GrowLog app diary.')
    console.log('Note: weather data could not be recovered (not stored in conversations).')
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message)
  process.exit(1)
})
