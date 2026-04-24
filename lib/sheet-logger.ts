export interface SheetLogPayload {
  token: string
  garden_name: string
  log_date: string
  crop_name: string
  variety?: string
  bed_location?: string
  observation: string
  action_taken: string
  ai_advice: string
  weather_summary: string
}

// POST session log data to the user's Google Apps Script web app URL
// Returns true if the sheet accepted it, false on any failure
export async function postToSheet(
  sheetUrl: string,
  payload: SheetLogPayload
): Promise<boolean> {
  try {
    const res = await fetch(sheetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify(payload),
      // Claude chose this approach because: sheet POSTs are best-effort;
      // a 5s timeout prevents a slow sheet from hanging the API route
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) return false

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) return false

    try {
      const json = await res.json()
      return json.ok === true
    } catch {
      return false
    }
  } catch {
    return false
  }
}
