import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface CropProfile {
  name: string
  variety?: string | null
  bedLocation?: string | null
  sowDate?: string | null
  status: string
  notes?: string | null
}

export interface GardenProfile {
  name: string
  location?: string | null
  usdaZone?: string | null
}

export interface WeatherSummary {
  temperature: number
  humidity: number
  windspeed: number
  weathercode: number
  mildewRisk: 'low' | 'medium' | 'high'
  description: string
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface SessionLogSummary {
  log_date: string
  observation: string | null
  action_taken: string | null
  ai_advice: string | null
  weather_summary: string | null
}

// ─── Growth stage inference ───────────────────────────────────────────────────

// Claude chose this approach because: giving the AI a named stage (not just days)
// lets it apply stage-appropriate advice without having to re-derive it from a number.
export function inferGrowthStage(ageInDays: number | null): string {
  if (ageInDays === null) return 'unknown (no sow date)'
  if (ageInDays < 0)  return 'not yet sown'
  if (ageInDays <= 14) return 'seedling (0–14 days)'
  if (ageInDays <= 30) return 'establishing (15–30 days)'
  if (ageInDays <= 60) return 'vegetative (31–60 days)'
  if (ageInDays <= 90) return 'mature (61–90 days)'
  return 'harvest-ready / late season (90+ days)'
}

// ─── Frost date lookup ────────────────────────────────────────────────────────

interface FrostDates {
  lastSpringFrost: string
  firstFallFrost: string
}

// Claude chose this approach because: frost dates are stable reference data.
// A hardcoded zone→date table avoids an extra API call on every chat request
// while giving the advisor the grounding it needs for timing advice.
const FROST_DATES: Record<string, FrostDates> = {
  '3a': { lastSpringFrost: 'late May (around May 25)', firstFallFrost: 'mid-September (around Sep 15)' },
  '3b': { lastSpringFrost: 'mid-May (around May 15)', firstFallFrost: 'late September (around Sep 25)' },
  '4a': { lastSpringFrost: 'early May (around May 5)', firstFallFrost: 'early October (around Oct 5)' },
  '4b': { lastSpringFrost: 'late April (around Apr 25)', firstFallFrost: 'mid-October (around Oct 15)' },
  '5a': { lastSpringFrost: 'mid-April (around Apr 15)', firstFallFrost: 'mid-October (around Oct 15)' },
  '5b': { lastSpringFrost: 'early April (around Apr 5)', firstFallFrost: 'late October (around Oct 25)' },
  '6a': { lastSpringFrost: 'late March (around Mar 25)', firstFallFrost: 'late October (around Oct 25)' },
  '6b': { lastSpringFrost: 'mid-April (around Apr 15)', firstFallFrost: 'mid-October (around Oct 15)' },
  '7a': { lastSpringFrost: 'early April (around Apr 5)', firstFallFrost: 'early November (around Nov 5)' },
  '7b': { lastSpringFrost: 'mid-March (around Mar 15)', firstFallFrost: 'mid-November (around Nov 15)' },
  '8a': { lastSpringFrost: 'early March (around Mar 5)', firstFallFrost: 'late November (around Nov 25)' },
  '8b': { lastSpringFrost: 'late February (around Feb 25)', firstFallFrost: 'mid-December (around Dec 15)' },
  '9a': { lastSpringFrost: 'early February (around Feb 5)', firstFallFrost: 'late December (around Dec 25)' },
  '9b': { lastSpringFrost: 'early January (around Jan 10)', firstFallFrost: 'rarely frosts' },
  '10a': { lastSpringFrost: 'frost-free most years', firstFallFrost: 'frost-free most years' },
  '10b': { lastSpringFrost: 'frost-free most years', firstFallFrost: 'frost-free most years' },
}

export function getFrostDates(usdaZone: string | null): FrostDates | null {
  if (!usdaZone) return null
  const key = usdaZone.toLowerCase().trim()
  return FROST_DATES[key] ?? null
}

// ─── System prompt builder ────────────────────────────────────────────────────

export function buildSystemPrompt(
  garden: GardenProfile,
  crop: CropProfile,
  weather: WeatherSummary | null,
  recentLogs: SessionLogSummary[] = []
): string {
  const today = new Date().toISOString().split('T')[0]

  const weatherBlock = weather
    ? `
## Current Weather (${garden.location ?? 'unknown location'})
- Temperature: ${weather.temperature}°C
- Humidity: ${weather.humidity}%
- Wind: ${weather.windspeed} km/h
- Conditions: ${weather.description}
- Mildew/disease risk today: **${weather.mildewRisk.toUpperCase()}**
`
    : ''

  const ageInDays = crop.sowDate
    ? Math.floor((Date.now() - new Date(crop.sowDate).getTime()) / 86400000)
    : null

  const cropAge = ageInDays !== null
    ? `${ageInDays} days since sowing`
    : 'sow date unknown'

  const growthStage = inferGrowthStage(ageInDays)

  const frostDates = getFrostDates(garden.usdaZone ?? null)
  const frostBlock = frostDates
    ? `- Approximate last spring frost: ${frostDates.lastSpringFrost}\n- Approximate first fall frost: ${frostDates.firstFallFrost}`
    : ''

  const pastSessionsBlock = recentLogs.length > 0
    ? `
## Past Sessions
${recentLogs.map(log => {
  const parts = []
  if (log.observation) parts.push(`Observed: ${log.observation}`)
  if (log.action_taken) parts.push(`Action: ${log.action_taken}`)
  if (log.ai_advice) parts.push(`Advice given: ${log.ai_advice}`)
  return `- ${log.log_date}: ${parts.join('. ')}`
}).join('\n')}
`
    : ''

  return `You are GrowLog AI, an expert vegetable gardening assistant. You help home gardeners track their crops, diagnose problems, and improve their harvests with clear, practical advice.

Today is ${today}.

## Garden
- Name: ${garden.name}
- Location: ${garden.location ?? 'not specified'}
- USDA Hardiness Zone: ${garden.usdaZone ?? 'not specified'}
${frostBlock}
${weatherBlock}
## Current Crop
- Crop: ${crop.name}${crop.variety ? ` (${crop.variety})` : ''}
- Bed/Location: ${crop.bedLocation ?? 'not specified'}
- Sow date: ${crop.sowDate ?? 'not specified'} (${cropAge})
- Growth stage: ${growthStage}
- Status: ${crop.status}
${crop.notes ? `- Notes/history: ${crop.notes}` : ''}
${pastSessionsBlock}
## Your job
- Only answer questions directly related to gardening, plants, soil, pests, diseases, weather, and harvests.
- If the user asks about anything unrelated to gardening, politely decline in one sentence and redirect them back to their crop.
- Give specific, actionable advice for this exact crop, at this growth stage, in this garden. Reference crop age, current weather, and frost dates when relevant.
- Do not recommend specific product brands.

## Confidence and diagnostic language
Before responding, assess your confidence level based on the context you have:

- **HIGH confidence** — crop, growth stage, location/zone, weather, and enough symptom detail are all present → give a clear, specific recommendation.
- **MEDIUM confidence** — some key detail is missing (e.g. no photo for a visual symptom, stage unclear, watering history unknown) → share the most likely possibilities with hedged language, then ask one focused follow-up question.
- **LOW confidence** — insufficient detail to diagnose safely (vague symptom, no crop context) → do NOT guess; ask for the single most important missing piece first.

**For visual problems (spots, discoloration, wilting, lesions, insects):**
- Always request a photo before making a definitive diagnosis.
- Say "I'd want to see a photo to confirm this" or "a photo would help me distinguish between X and Y."

**Language rules:**
- Do NOT say: "Your plant has early blight", "This is nitrogen deficiency", "You should spray with…"
- DO say: "This could be early blight — a photo would help distinguish it from nutrient stress.", "The pattern is consistent with nitrogen deficiency, though recent watering and soil conditions matter.", "A safer first step would be…"
- Never make a definitive diagnosis without a photo and high confidence.

## Response structure
For diagnostic or problem-solving questions, use this structure:
1. **What I'm seeing** — briefly restate what the user described so they know you understood
2. **Most likely cause(s)** — with appropriate confidence language
3. **Next step** — one clear, practical action to take now
4. **Watch for** — what to monitor and over what timeframe
5. **Escalate if** — when to contact local cooperative extension or seek expert help

For simple, factual questions a concise direct answer is fine — do not force the structure when it's unnecessary.

## Sources
Base recommendations on established horticultural practice — university extension guidance, USDA resources, and IPM (Integrated Pest Management) principles where applicable.
- Do NOT invent citations or claim specific sources you cannot verify.
- When giving factual recommendations, it is acceptable to say "based on general horticultural practice."
- For high-stakes decisions (pesticide application, significant crop loss risk, unknown disease), encourage the user to confirm with their local cooperative extension service.

## IMPORTANT: Session log — append at the end of EVERY response
After your main advice, append a JSON block exactly like this (the app strips it before showing to the user):

\`\`\`json
{
  "log": {
    "observation": "one sentence summary of what the user reported",
    "action_taken": "one sentence summary of what the user said they did or plan to do",
    "ai_advice": "one sentence core recommendation you gave",
    "weather_summary": "${weather ? `${weather.temperature}°C, ${weather.description}, mildew risk ${weather.mildewRisk}` : 'no weather data'}",
    "confidence": "high|medium|low"
  }
}
\`\`\`

Fill in each field based on the conversation. Set confidence to the level you assessed before responding. If a field has no applicable content, use an empty string.`
}

// Trim conversation history to last 6 messages
export function trimHistory(messages: ConversationMessage[]): ConversationMessage[] {
  // Claude chose this approach because: session logs in the system prompt now
  // cover historical context; we only need the last few raw messages for
  // immediate conversational continuity.
  return messages.slice(-6)
}
