import { describe, it, expect } from 'vitest'
import { extractSessionLog } from '../lib/session-extractor'

describe('extractSessionLog', () => {
  it('returns cleanText and null log when no JSON block present', () => {
    const raw = 'Check your soil moisture and water at the base of the plant.'
    const { cleanText, log } = extractSessionLog(raw)
    expect(cleanText).toBe(raw)
    expect(log).toBeNull()
  })

  it('strips the JSON block from the displayed text', () => {
    const raw = `Water deeply at the base, not overhead.

\`\`\`json
{
  "log": {
    "observation": "leaves curling inward",
    "action_taken": "user plans to water this evening",
    "ai_advice": "water deeply at the base to reduce mildew risk",
    "weather_summary": "22°C, overcast, mildew risk high",
    "confidence": "medium"
  }
}
\`\`\``

    const { cleanText, log } = extractSessionLog(raw)
    expect(cleanText).not.toContain('```json')
    expect(cleanText).not.toContain('"observation"')
    expect(cleanText).toContain('Water deeply at the base')
  })

  it('extracts all standard log fields', () => {
    const raw = `Some advice here.

\`\`\`json
{
  "log": {
    "observation": "yellowing lower leaves",
    "action_taken": "removed three affected leaves",
    "ai_advice": "watch for spreading and improve air circulation",
    "weather_summary": "18°C, humid, mildew risk medium",
    "confidence": "medium"
  }
}
\`\`\``

    const { log } = extractSessionLog(raw)
    expect(log).not.toBeNull()
    expect(log?.observation).toBe('yellowing lower leaves')
    expect(log?.action_taken).toBe('removed three affected leaves')
    expect(log?.ai_advice).toBe('watch for spreading and improve air circulation')
    expect(log?.weather_summary).toContain('mildew risk medium')
  })

  it('extracts confidence field', () => {
    const raw = `Here is my advice.

\`\`\`json
{
  "log": {
    "observation": "white powdery spots on leaves",
    "action_taken": "",
    "ai_advice": "likely powdery mildew — improve airflow and avoid overhead watering",
    "weather_summary": "25°C, high humidity, mildew risk high",
    "confidence": "high"
  }
}
\`\`\``

    const { log } = extractSessionLog(raw)
    expect(log?.confidence).toBe('high')
  })

  it('handles low confidence value', () => {
    const raw = `I need more information.

\`\`\`json
{
  "log": {
    "observation": "plant looks off",
    "action_taken": "",
    "ai_advice": "asked user for more detail and a photo",
    "weather_summary": "no weather data",
    "confidence": "low"
  }
}
\`\`\``

    const { log } = extractSessionLog(raw)
    expect(log?.confidence).toBe('low')
  })

  it('returns cleanText with null log if JSON is malformed', () => {
    const raw = `Some advice here.

\`\`\`json
{ this is not valid json
\`\`\``

    const { cleanText, log } = extractSessionLog(raw)
    expect(log).toBeNull()
    expect(cleanText).toBeTruthy()
  })

  it('handles JSON block with no surrounding whitespace', () => {
    const raw = 'Short advice.\n```json\n{"log":{"observation":"test","action_taken":"","ai_advice":"advice","weather_summary":"","confidence":"high"}}\n```'
    const { log } = extractSessionLog(raw)
    expect(log).not.toBeNull()
    expect(log?.confidence).toBe('high')
  })
})
