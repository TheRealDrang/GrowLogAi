import { describe, it, expect } from 'vitest'
import {
  buildSystemPrompt,
  inferGrowthStage,
  getFrostDates,
  type GardenProfile,
  type CropProfile,
  type WeatherSummary,
} from '../lib/anthropic'

// ─── inferGrowthStage ─────────────────────────────────────────────────────────

describe('inferGrowthStage', () => {
  it('returns unknown when no sow date', () => {
    expect(inferGrowthStage(null)).toContain('unknown')
  })

  it('returns seedling for 0–14 days', () => {
    expect(inferGrowthStage(0)).toContain('seedling')
    expect(inferGrowthStage(14)).toContain('seedling')
  })

  it('returns establishing for 15–30 days', () => {
    expect(inferGrowthStage(15)).toContain('establishing')
    expect(inferGrowthStage(30)).toContain('establishing')
  })

  it('returns vegetative for 31–60 days', () => {
    expect(inferGrowthStage(31)).toContain('vegetative')
    expect(inferGrowthStage(60)).toContain('vegetative')
  })

  it('returns mature for 61–90 days', () => {
    expect(inferGrowthStage(61)).toContain('mature')
    expect(inferGrowthStage(90)).toContain('mature')
  })

  it('returns harvest-ready for 90+ days', () => {
    expect(inferGrowthStage(91)).toContain('harvest')
    expect(inferGrowthStage(200)).toContain('harvest')
  })
})

// ─── getFrostDates ────────────────────────────────────────────────────────────

describe('getFrostDates', () => {
  it('returns null for null zone', () => {
    expect(getFrostDates(null)).toBeNull()
  })

  it('returns null for unknown zone', () => {
    expect(getFrostDates('99z')).toBeNull()
  })

  it('returns frost dates for zone 6b', () => {
    const dates = getFrostDates('6b')
    expect(dates).not.toBeNull()
    expect(dates?.lastSpringFrost).toBeTruthy()
    expect(dates?.firstFallFrost).toBeTruthy()
  })

  it('is case-insensitive', () => {
    expect(getFrostDates('6B')).toEqual(getFrostDates('6b'))
  })
})

// ─── buildSystemPrompt ────────────────────────────────────────────────────────

const garden: GardenProfile = {
  name: 'Test Garden',
  location: 'Ridgefield, CT',
  usdaZone: '6b',
}

const crop: CropProfile = {
  name: 'Tomato',
  variety: 'Cherokee Purple',
  bedLocation: 'Raised bed A',
  sowDate: new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0], // 45 days ago
  status: 'growing',
  notes: null,
}

const weather: WeatherSummary = {
  temperature: 22,
  humidity: 88,
  windspeed: 12,
  weathercode: 3,
  mildewRisk: 'high',
  description: 'Overcast',
}

describe('buildSystemPrompt — context inclusion', () => {
  it('includes garden name and location', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt).toContain('Test Garden')
    expect(prompt).toContain('Ridgefield, CT')
  })

  it('includes USDA zone', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt).toContain('6b')
  })

  it('includes frost dates for zone 6b', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt).toContain('frost')
  })

  it('includes crop name and variety', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt).toContain('Tomato')
    expect(prompt).toContain('Cherokee Purple')
  })

  it('includes growth stage derived from sow date', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt).toContain('vegetative') // 45 days = vegetative stage
  })

  it('includes weather when provided', () => {
    const prompt = buildSystemPrompt(garden, crop, weather)
    expect(prompt).toContain('22°C')
    expect(prompt).toContain('HIGH') // mildew risk
  })

  it('omits weather block when not provided', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt).not.toContain('Mildew/disease risk')
  })

  it('includes past sessions when provided', () => {
    const logs = [
      {
        log_date: '2026-06-01',
        observation: 'yellowing leaves on lower stems',
        action_taken: 'removed affected leaves',
        ai_advice: 'monitor for further spread',
        weather_summary: '20°C, clear',
      },
    ]
    const prompt = buildSystemPrompt(garden, crop, null, logs)
    expect(prompt).toContain('yellowing leaves on lower stems')
    expect(prompt).toContain('monitor for further spread')
  })
})

describe('buildSystemPrompt — advisor behavior instructions', () => {
  it('instructs advisor to ask for a photo for visual problems', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt.toLowerCase()).toContain('photo')
  })

  it('instructs advisor not to make definitive diagnoses', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    // Should contain hedged language instruction
    expect(prompt).toContain('could be')
  })

  it('instructs advisor not to invent citations', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt.toLowerCase()).toContain('do not invent')
  })

  it('includes confidence rubric with high/medium/low levels', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt.toLowerCase()).toContain('high confidence')
    expect(prompt.toLowerCase()).toContain('medium confidence')
    expect(prompt.toLowerCase()).toContain('low confidence')
  })

  it('includes cooperative extension escalation guidance', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt.toLowerCase()).toContain('extension')
  })

  it('includes confidence field in session log JSON template', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt).toContain('"confidence"')
  })

  it('includes response structure headings', () => {
    const prompt = buildSystemPrompt(garden, crop, null)
    expect(prompt).toContain('What I\'m seeing')
    expect(prompt).toContain('Most likely cause')
    expect(prompt).toContain('Next step')
    expect(prompt).toContain('Watch for')
    expect(prompt).toContain('Escalate if')
  })
})
