import { createSupabaseAdminClient } from './supabase'
import { fetchForecast, ForecastData } from './weather'
import { anthropic } from './anthropic'
import { Resend } from 'resend'

// Days before a dismissed alert of this type can re-trigger
const RE_ALERT_DAYS: Record<string, number> = {
  weather_rain: 0, weather_dry: 0, weather_frost: 0,
  weather_mildew: 3, weather_wind: 0,
  followup_advisor: 3,  // Claude chose 3 days: short enough to stay relevant, long enough not to nag
  no_checkin: 7, harvest_approaching: 1,
  ai_insight: 7,
}

interface Garden {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  location: string | null
  usda_zone: string | null
}

interface Crop {
  id: string
  name: string
  variety?: string | null
  harvest_date?: string | null
  session_logs?: Array<{
    observation: string | null
    action_taken: string | null
    ai_advice: string | null
    followup_days: number
    created_at: string
    log_date: string | null
  }>
}

interface AlertCandidate {
  alert_type: string
  priority: number
  title: string
  body: string
  action_label: string | null
  action_url: string | null
  chat_context: string | null
  garden_id: string | null
  crop_id: string | null
  expires_at: string | null
}

type AlertGenerationResult = {
  owners: number
  processed: number
  alertsGenerated: number
  failed: number
}

type DigestSendResult = {
  users: number
  sent: number
  skipped: number
  failed: number
}

function buildAlert(
  type: string,
  garden: Garden,
  crop: Crop | null,
  overrides: {
    priority?: number
    expires_in_hours?: number
    body?: string
    chat_context?: string
  }
): AlertCandidate {
  const cropName = crop?.name ?? ''
  const expiresAt = overrides.expires_in_hours
    ? new Date(Date.now() + overrides.expires_in_hours * 3600 * 1000).toISOString()
    : null

  const templates: Record<string, { title: string; body: string; action_label: string; chat_context: string }> = {
    weather_rain: {
      title: 'Rain expected soon',
      body: `Skip watering${cropName ? ` your ${cropName}` : ''} — rain is coming in the next day or two.`,
      action_label: 'View forecast',
      chat_context: 'The user is following up on a rain alert. Help them plan around the incoming precipitation and any crops that might need protection from heavy rain.',
    },
    weather_dry: {
      title: 'Dry stretch ahead',
      body: `No rain forecast for the next few days. Check soil moisture and prepare to water${cropName ? ` your ${cropName}` : ''} more frequently.`,
      action_label: 'Get watering tips',
      chat_context: 'The user is following up on a dry weather alert. Help them plan a watering schedule and conserve moisture in their garden.',
    },
    weather_frost: {
      title: 'Frost risk tonight',
      body: `Overnight temperatures may drop near freezing. Consider covering tender crops${cropName ? ` like your ${cropName}` : ''}.`,
      action_label: 'Frost protection tips',
      chat_context: 'The user is following up on a frost alert. Help them protect their crops from frost damage — covering methods, timing, and which plants to prioritize.',
    },
    weather_mildew: {
      title: 'High mildew risk',
      body: `Humidity has been high for 2+ days. Inspect crops${cropName ? ` including your ${cropName}` : ''} for early signs of mildew.`,
      action_label: 'Mildew prevention tips',
      chat_context: 'The user is following up on a high mildew risk alert. Help them identify early mildew signs and take preventative action.',
    },
    weather_wind: {
      title: 'High winds forecast',
      body: `Wind gusts expected. Check supports and stakes on tall crops${cropName ? ` including your ${cropName}` : ''}.`,
      action_label: 'Wind protection tips',
      chat_context: 'The user is following up on a high wind alert. Help them protect their crops from wind damage — staking, tying, and shelter options.',
    },
    no_checkin: {
      title: 'Check-in overdue',
      body: `You haven't logged anything for${cropName ? ` your ${cropName}` : ' this crop'} in 2+ weeks. How is it going?`,
      action_label: 'Log a session',
      chat_context: "The user hasn't checked in on this crop in a while. Ask how it's going and encourage them to log an observation.",
    },
    followup_advisor: {
      // Claude chose this approach because: the body and chat_context are always set by
      // the caller using the actual ai_advice text — this template is a fallback only.
      title: `Time to check in on your ${cropName || 'crop'}`,
      body: overrides.body ?? `Your advisor had a recommendation for this crop. Log how it went.`,
      action_label: 'Log a session',
      chat_context: overrides.chat_context ?? `The advisor gave specific advice for this crop that the user should follow up on. Ask how things went.`,
    },
    harvest_approaching: {
      title: 'Harvest approaching',
      body: `${cropName ? `Your ${cropName}` : 'A crop'} is due for harvest soon. Check it's ready.`,
      action_label: 'Harvest tips',
      chat_context: `This crop is approaching its expected harvest date. Help the user assess readiness and plan for harvest.`,
    },
    ai_insight: {
      title: "This week's garden insight",
      body: overrides.body ?? '',
      action_label: 'Discuss with advisor',
      chat_context: overrides.chat_context ?? 'The user received a weekly AI-generated garden insight. Discuss the observation and help them act on it.',
    },
  }

  const t = templates[type] ?? {
    title: 'Garden alert',
    body: 'Something needs your attention in the garden.',
    action_label: 'View',
    chat_context: null,
  }

  return {
    alert_type: type,
    priority: overrides.priority ?? 2,
    title: t.title,
    body: overrides.body ?? t.body,
    action_label: t.action_label,
    action_url: crop ? `/crop/${crop.id}` : null,
    chat_context: overrides.chat_context ?? t.chat_context,
    garden_id: garden.id,
    crop_id: crop?.id ?? null,
    expires_at: expiresAt,
  }
}

async function upsertAlert(
  adminClient: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  alert: AlertCandidate
): Promise<void> {
  // Check for existing alert of same type for same garden/crop
  let query = adminClient
    .from('garden_alerts')
    .select('id, status, acknowledged_at')
    .eq('user_id', userId)
    .eq('alert_type', alert.alert_type)
    .eq('garden_id', alert.garden_id ?? '')

  if (alert.crop_id) {
    query = query.eq('crop_id', alert.crop_id)
  } else {
    query = query.is('crop_id', null)
  }

  const { data: existing } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (existing) {
    if (existing.status === 'active') {
      // Refresh the existing active alert
      await adminClient
        .from('garden_alerts')
        .update({
          title: alert.title,
          body: alert.body,
          chat_context: alert.chat_context,
          expires_at: alert.expires_at,
          generated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      return
    }

    if (existing.status === 'dismissed' || existing.status === 'acknowledged') {
      const reDays = RE_ALERT_DAYS[alert.alert_type] ?? 7
      if (reDays === 0) {
        // Always re-create (e.g. weather alerts)
      } else if (existing.acknowledged_at) {
        const daysSince = (Date.now() - new Date(existing.acknowledged_at).getTime()) / 86400000
        if (daysSince < reDays) return  // too soon to re-alert
      } else {
        return  // dismissed with no ack timestamp, respect cooldown
      }
    }
  }

  // Insert new alert
  await adminClient.from('garden_alerts').insert({
    user_id: userId,
    garden_id: alert.garden_id,
    crop_id: alert.crop_id,
    alert_type: alert.alert_type,
    priority: alert.priority,
    title: alert.title,
    body: alert.body,
    action_label: alert.action_label,
    action_url: alert.action_url,
    chat_context: alert.chat_context,
    expires_at: alert.expires_at,
    status: 'active',
  })
}

async function generateInsightWithClaude(
  garden: Garden,
  crops: Crop[],
  forecast: ForecastData | null
): Promise<string | null> {
  try {
    const cropSummaries = crops.map(c => {
      const logs = (c.session_logs ?? []).slice(0, 3)
      const lastLog = logs[0]
      const daysSince = lastLog
        ? Math.floor((Date.now() - new Date(lastLog.created_at).getTime()) / 86400000)
        : null
      return `- ${c.name}${c.variety ? ` (${c.variety})` : ''}: last logged ${daysSince != null ? `${daysSince} days ago` : 'never'}${lastLog?.observation ? `, observation: "${lastLog.observation?.slice(0, 100)}"` : ''}`
    }).join('\n')

    const forecastSummary = forecast
      ? `3-day forecast: rain ${forecast.dailyRainMm.join('/')} mm, temps ${forecast.dailyMinTemp.map((t, i) => `${t}–${forecast.dailyMaxTemp[i]}°C`).join(', ')}`
      : 'No forecast data available'

    const prompt = `You are a gardening advisor. Given this garden summary, provide ONE short actionable observation or tip that a rule-based system wouldn't catch. Max 60 words. Plain text, no markdown, no intro phrases like "Here is my tip:".

Garden: ${garden.name} (Zone ${garden.usda_zone ?? 'unknown'}, ${garden.location ?? 'unknown location'})
Crops:
${cropSummaries}
Weather: ${forecastSummary}`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : null
    return text || null
  } catch (err) {
    console.error('[generateInsightWithClaude]', err)
    return null
  }
}

export async function generateAlerts(): Promise<AlertGenerationResult> {
  const adminClient = createSupabaseAdminClient()

  // Get all garden owners
  const { data: owners } = await adminClient
    .from('garden_members')
    .select('user_id, garden_id')
    .eq('role', 'owner')

  const today = new Date()
  const isMonday = today.getDay() === 1
  const result: AlertGenerationResult = {
    owners: owners?.length ?? 0,
    processed: 0,
    alertsGenerated: 0,
    failed: 0,
  }

  for (const { user_id, garden_id } of owners ?? []) {
    try {
      const { data: garden } = await adminClient
        .from('gardens')
        .select('id, name, latitude, longitude, location, usda_zone')
        .eq('id', garden_id)
        .single()

      if (!garden?.latitude || !garden?.longitude) continue

      // Clean up any active legacy keyword-based alerts — these are replaced by followup_advisor
      await adminClient
        .from('garden_alerts')
        .update({ status: 'expired' })
        .in('alert_type', ['followup_pest', 'followup_ph', 'followup_fertilize', 'followup_transplant'])
        .eq('user_id', user_id)
        .eq('status', 'active')

      const { data: crops } = await adminClient
        .from('crops')
        .select('id, name, variety, harvest_date, session_logs(observation, action_taken, ai_advice, followup_days, created_at, log_date)')
        .eq('garden_id', garden_id)
        .eq('status', 'growing')
        .order('created_at', { referencedTable: 'session_logs', ascending: false })

      const forecast = await fetchForecast(garden.latitude, garden.longitude)

      const alerts: AlertCandidate[] = []

      // === Category A: Weather alerts ===
      if (forecast) {
        // Claude chose 3mm threshold because: light rain (2-4mm) still means skip watering;
        // the previous 5mm threshold missed moderate rain events common in the Northeast
        if (forecast.dailyRainMm[0] > 3 || forecast.dailyRainMm[1] > 3)
          alerts.push(buildAlert('weather_rain', garden, null, { expires_in_hours: 36 }))

        // Claude chose to remove the >25°C temp condition because: the previous condition
        // required both no rain AND high heat, so dry stretches in cooler weather never triggered.
        // Any 3-day rain-free stretch is worth a watering reminder regardless of temperature.
        if (forecast.dailyRainMm.every(mm => mm < 1))
          alerts.push(buildAlert('weather_dry', garden, null, { expires_in_hours: 72 }))

        if (forecast.dailyMinTemp[0] < 2 || forecast.dailyMinTemp[1] < 2)
          alerts.push(buildAlert('weather_frost', garden, null, { priority: 1, expires_in_hours: 48 }))

        if (
          forecast.dailyMaxHumidity[0] > 80 && forecast.dailyMaxTemp[0] > 10 && forecast.dailyMaxTemp[0] < 26 &&
          forecast.dailyMaxHumidity[1] > 80
        )
          alerts.push(buildAlert('weather_mildew', garden, null, {}))

        if (forecast.dailyMaxWindKph[0] > 40 || forecast.dailyMaxWindKph[1] > 40)
          alerts.push(buildAlert('weather_wind', garden, null, { expires_in_hours: 48 }))
      }

      // === Category B: Advisor follow-up alerts ===
      // Claude chose this approach because: only the advisor knows when follow-up is needed.
      // Keyword scanning produced false positives. Now the advisor sets followup_days directly
      // in its structured JSON output when it recommends a specific action.
      for (const crop of crops ?? []) {
        const logs = (crop.session_logs as Crop['session_logs']) ?? []
        const lastLog = logs[0]

        // followup_advisor fires when:
        // 1. The most recent session log has followup_days > 0 (advisor flagged a follow-up)
        // 2. That many days have passed since the session
        // 3. The user hasn't logged a new session since (which would push this log off logs[0])
        if (lastLog && (lastLog.followup_days ?? 0) > 0 && lastLog.ai_advice) {
          const daysSince = (Date.now() - new Date(lastLog.created_at).getTime()) / 86400000
          if (daysSince >= lastLog.followup_days) {
            const daysAgo = Math.floor(daysSince)
            alerts.push(buildAlert('followup_advisor', garden, crop, {
              priority: 1,
              body: `${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago your advisor said: "${lastLog.ai_advice}" — how did it go?`,
              chat_context: `The user received this advice ${daysAgo} days ago for their ${crop.name}: "${lastLog.ai_advice}". Ask them whether they took action and how the crop has responded since.`,
            }))
          }
        }

        if (crop.harvest_date) {
          const daysUntil = (new Date(crop.harvest_date).getTime() - Date.now()) / 86400000
          if (daysUntil >= 0 && daysUntil < 7)
            alerts.push(buildAlert('harvest_approaching', garden, crop, { priority: 1 }))
        }
      }

      // === Category C: Weekly AI insight (Mondays only) ===
      if (isMonday && crops && crops.length > 0) {
        const insight = await generateInsightWithClaude(garden, crops as Crop[], forecast)
        if (insight) {
          alerts.push(buildAlert('ai_insight', garden, null, {
            body: insight,
            chat_context: `The user received this weekly garden insight: "${insight}". Discuss it and help them act on it.`,
          }))
        }
      }

      // Expire any active weather alerts whose condition is no longer true this run.
      // Without this, a rain alert from yesterday stays active alongside today's dry alert.
      const ALL_WEATHER_TYPES = ['weather_rain', 'weather_dry', 'weather_frost', 'weather_mildew', 'weather_wind']
      const generatedWeatherTypes = new Set(
        alerts.filter(a => a.alert_type.startsWith('weather_')).map(a => a.alert_type)
      )
      const staleWeatherTypes = ALL_WEATHER_TYPES.filter(t => !generatedWeatherTypes.has(t))
      if (staleWeatherTypes.length > 0) {
        await adminClient
          .from('garden_alerts')
          .update({ status: 'expired' })
          .eq('user_id', user_id)
          .eq('garden_id', garden.id)
          .in('alert_type', staleWeatherTypes)
          .eq('status', 'active')
      }

      // Upsert all generated alerts
      for (const alert of alerts) {
        await upsertAlert(adminClient, user_id, alert)
      }
      result.processed++
      result.alertsGenerated += alerts.length
    } catch (err) {
      result.failed++
      console.error(`[generateAlerts] garden ${garden_id}:`, err)
    }
  }

  return result
}

function buildSubjectLine(alerts: { priority: number; title: string }[], displayName: string | null): string {
  const urgent = alerts.filter(a => a.priority === 1)
  const name = displayName ? `, ${displayName}` : ''
  if (urgent.length > 0) return `🌱 GrowLog: Action needed${name} — ${urgent[0].title}`
  return `🌱 GrowLog: ${alerts.length} garden update${alerts.length !== 1 ? 's' : ''} today${name}`
}

function buildDigestEmailHtml(
  alerts: Array<{ title: string; body: string; action_label: string | null; action_url: string | null; priority: number }>,
  remaining: number,
  displayName: string | null,
  unsubscribeToken: string
): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://growlogai.com'
  // Claude chose unsubscribeToken rather than userId because: opaque UUID prevents someone from
  // constructing a link that unsubscribes any account whose ID they know.
  const unsubscribeUrl = `${appUrl}/api/alerts/opt-out?token=${unsubscribeToken}`
  const greeting = displayName ? `Hi ${displayName},` : 'Hi there,'

  const alertRows = alerts.map(a => {
    const priorityColor = a.priority === 1 ? '#c0392b' : '#3d5a3e'
    const actionHtml = a.action_url
      ? `<p style="margin:8px 0 0;"><a href="${appUrl}${a.action_url}" style="color:${priorityColor};font-family:Arial,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;">${a.action_label ?? 'View →'}</a></p>`
      : ''
    return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #e8e0d0;">
        <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:16px;color:#2c1810;">
          ${a.priority === 1 ? '⚠️ ' : ''}${a.title}
        </p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#5c4030;line-height:1.5;">
          ${a.body}
        </p>
        ${actionHtml}
      </td>
    </tr>`
  }).join('')

  const remainingNote = remaining > 0
    ? `<p style="margin:16px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#8a7060;">+ ${remaining} more update${remaining !== 1 ? 's' : ''} — <a href="${appUrl}/dashboard" style="color:#3d5a3e;">view all on your dashboard</a></p>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your GrowLog updates</title>
</head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#fffdf7;border-radius:16px;overflow:hidden;border:1px solid #e8e0d0;">
        <tr>
          <td style="background:#3d5a3e;padding:28px 36px;">
            <p style="margin:0;font-family:Georgia,serif;font-size:22px;color:#f5f0e8;letter-spacing:-0.3px;">
              🌱 GrowLog AI
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 36px 28px;">
            <p style="margin:0 0 4px;font-size:22px;color:#2c1810;font-family:Georgia,serif;">
              Your garden updates
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#5c4030;font-family:Arial,sans-serif;line-height:1.6;">
              ${greeting} Here's what needs your attention today.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${alertRows}
            </table>
            ${remainingNote}
            <table cellpadding="0" cellspacing="0" style="margin-top:28px;">
              <tr>
                <td style="background:#3d5a3e;border-radius:10px;padding:13px 28px;">
                  <a href="${appUrl}/dashboard"
                     style="color:#f5f0e8;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;">
                    View dashboard →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f0ebe0;padding:16px 36px;border-top:1px solid #e8e0d0;">
            <p style="margin:0;font-size:11px;color:#a09080;font-family:Arial,sans-serif;line-height:1.6;">
              You're receiving this because you have active GrowLog gardens.
              <a href="${unsubscribeUrl}" style="color:#a09080;">Unsubscribe from daily digests</a>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendDigests(): Promise<DigestSendResult> {
  const adminClient = createSupabaseAdminClient()
  const resend = new Resend(process.env.RESEND_API_KEY)
  const todayStr = new Date().toISOString().split('T')[0]
  const now = new Date().toISOString()

  // Get distinct user IDs with active, non-expired alerts
  const { data: alertRows } = await adminClient
    .from('garden_alerts')
    .select('user_id')
    .eq('status', 'active')
    .or(`expires_at.is.null,expires_at.gt.${now}`)

  const userIds = [...new Set((alertRows ?? []).map(r => r.user_id))]
  const result: DigestSendResult = {
    users: userIds.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  }

  for (const user_id of userIds) {
    try {
      // Check digest_enabled on profile; also fetch unsubscribe_token for the email footer
      const { data: profile } = await adminClient
        .from('profiles')
        .select('display_name, digest_enabled, unsubscribe_token')
        .eq('id', user_id)
        .single()
      if (!profile?.digest_enabled) {
        result.skipped++
        continue
      }

      // Check if we already sent one today
      const { count } = await adminClient
        .from('digest_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .gte('sent_at', `${todayStr}T00:00:00Z`)
      if ((count ?? 0) > 0) {
        result.skipped++
        continue
      }

      // Get user email via admin auth
      const { data: { user } } = await adminClient.auth.admin.getUserById(user_id)
      if (!user?.email) {
        result.skipped++
        continue
      }

      // Fetch top 10 active alerts by priority
      const { data: alerts } = await adminClient
        .from('garden_alerts')
        .select('*, gardens(name), crops(name)')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('priority')
        .order('generated_at', { ascending: false })
        .limit(10)

      if (!alerts || alerts.length === 0) {
        result.skipped++
        continue
      }

      const top5 = alerts.slice(0, 5)
      const remaining = alerts.length - 5

      const { data: emailResult } = await resend.emails.send({
        from: 'GrowLog AI <alerts@growlogai.com>',
        to: user.email,
        subject: buildSubjectLine(alerts, profile.display_name),
        html: buildDigestEmailHtml(top5, remaining > 0 ? remaining : 0, profile.display_name, profile.unsubscribe_token ?? user_id),
      })

      await adminClient.from('digest_log').insert({
        user_id,
        alert_count: alerts.length,
        email_id: (emailResult as { id?: string } | null)?.id ?? null,
      })
      result.sent++
    } catch (err) {
      result.failed++
      console.error(`[sendDigests] user ${user_id}:`, err)
    }
  }

  return result
}
