import { sheetSafe } from './google-sheets'

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

// True only for https://script.google.com/... addresses (Google Apps Script web apps).
// Claude chose this approach because: the server sends SHEET_SECRET_TOKEN to this address,
// so it must never be a site the user controls or an internal network address.
export function isAppsScriptUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname === 'script.google.com'
  } catch {
    return false
  }
}

// POST session log data to the user's Google Apps Script web app URL
// Returns true if the sheet accepted it, false on any failure
export async function postToSheet(
  sheetUrl: string,
  payload: SheetLogPayload
): Promise<boolean> {
  // Refuse non-Google addresses, including any saved before validation existed
  if (!isAppsScriptUrl(sheetUrl)) return false

  try {
    const res = await fetch(sheetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      // Neutralize formula-like text — the Apps Script writes these fields with appendRow
      body: JSON.stringify(
        Object.fromEntries(
          Object.entries(payload).map(([key, value]) => [key, key === 'token' ? value : sheetSafe(value)])
        )
      ),
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
