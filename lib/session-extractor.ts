export interface SessionLog {
  observation: string
  action_taken: string
  ai_advice: string
  weather_summary: string
}

// Strip the ```json ... ``` block from the AI response tail and extract the log
// Returns { cleanText, log } — cleanText is what gets shown to the user
export function extractSessionLog(rawText: string): {
  cleanText: string
  log: SessionLog | null
} {
  // Claude chose this approach because: the AI is instructed to always append
  // the json block at the end, so we search from the end for the last ```json block
  const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```\s*$/

  const match = rawText.match(jsonBlockRegex)

  if (!match) {
    return { cleanText: rawText.trim(), log: null }
  }

  const cleanText = rawText.replace(jsonBlockRegex, '').trim()

  try {
    const parsed = JSON.parse(match[1])
    const log = parsed.log as SessionLog
    return { cleanText, log }
  } catch {
    return { cleanText, log: null }
  }
}
