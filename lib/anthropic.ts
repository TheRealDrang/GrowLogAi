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

// Build the system prompt injected into every AI call
export function buildSystemPrompt(
  garden: GardenProfile,
  crop: CropProfile,
  weather: WeatherSummary | null
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

## Your job
- Give specific, actionable advice for this exact crop in this garden
- Reference current weather when relevant (especially mildew/disease risk)
- Keep responses concise — bullet points preferred for action items
- If you notice something worrying, say so clearly

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

// Trim conversation history: keep last 10 full turns when > 20 turns
export function trimHistory(messages: ConversationMessage[]): ConversationMessage[] {
  if (messages.length <= 20) return messages
  // Claude chose this approach because: beyond 20 turns, crop.notes stores a summary
  // so we only send the recent 10 turns to keep token usage bounded
  return messages.slice(-10)
}
