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

// Build the system prompt injected into every AI call
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

  const cropAge = crop.sowDate
    ? `${Math.floor((Date.now() - new Date(crop.sowDate).getTime()) / 86400000)} days since sowing`
    : 'sow date unknown'

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
${weatherBlock}
## Current Crop
- Crop: ${crop.name}${crop.variety ? ` (${crop.variety})` : ''}
- Bed/Location: ${crop.bedLocation ?? 'not specified'}
- Sow date: ${crop.sowDate ?? 'not specified'} (${cropAge})
- Status: ${crop.status}
${crop.notes ? `- Notes/history: ${crop.notes}` : ''}
${pastSessionsBlock}
## Your job
- Only answer questions directly related to gardening, plants, soil, pests, diseases, weather, and harvests.
- If the user asks about anything unrelated to gardening, politely decline in one sentence and redirect them back to their crop.
- Give specific, actionable advice for this exact crop in this garden.
- Reference current weather when relevant (especially mildew/disease risk).
- Keep responses concise — bullet points preferred for action items. Only write long responses when the topic genuinely requires it.
- If a question is too vague to answer usefully, ask one clarifying question instead of guessing.
- If you notice something worrying, say so clearly.
- Do not recommend specific product brands.

## IMPORTANT: Session log — append at the end of EVERY response
After your main advice, append a JSON block exactly like this (the app strips it before showing to the user):

\`\`\`json
{
  "log": {
    "observation": "one sentence summary of what the user reported",
    "action_taken": "one sentence summary of what the user said they did or plan to do",
    "ai_advice": "one sentence core recommendation you gave",
    "weather_summary": "${weather ? `${weather.temperature}°C, ${weather.description}, mildew risk ${weather.mildewRisk}` : 'no weather data'}"
  }
}
\`\`\`

Fill in each field based on the conversation. If a field has no applicable content, use an empty string.`
}

// Trim conversation history to last 6 messages
export function trimHistory(messages: ConversationMessage[]): ConversationMessage[] {
  // Claude chose this approach because: session logs in the system prompt now
  // cover historical context; we only need the last few raw messages for
  // immediate conversational continuity.
  return messages.slice(-6)
}
