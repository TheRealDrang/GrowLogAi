// Google Sheets and Drive API helpers — used for Google OAuth users only.
// Email/password users continue to use the Apps Script approach.

const HEADERS = ['Date', 'Crop', 'Variety', 'Bed', 'Observation', 'Action Taken', 'AI Advice', 'Weather', 'Full Response']

export interface SheetRowData {
  log_date: string
  crop_name: string
  variety: string
  bed_location: string
  observation: string
  action_taken: string
  ai_advice: string
  weather_summary: string
  full_response: string
}

// Exchange a stored refresh token for a fresh access token
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token ?? null
  } catch {
    return null
  }
}

// Create a new Google Spreadsheet and return its ID
export async function createSpreadsheet(accessToken: string, title: string): Promise<string | null> {
  try {
    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title },
        // Start with a placeholder Overview sheet — crop tabs are created on first chat
        sheets: [{ properties: { title: 'Overview' } }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.spreadsheetId ?? null
  } catch {
    return null
  }
}

const DAILY_LOG_HEADERS = ['Date', 'Garden', 'Location', 'USDA Zone', 'Temp °C', 'Humidity %', 'Wind km/h', 'Conditions', 'Mildew Risk']

export interface DailyLogRow {
  log_date: string
  garden_name: string
  location: string
  usda_zone: string
  temperature: number
  humidity: number
  windspeed: number
  conditions: string
  mildew_risk: string
}

// Append a weather row to the "Daily Log" tab, creating it with headers if needed
export async function appendToDailyLog(
  accessToken: string,
  spreadsheetId: string,
  row: DailyLogRow
): Promise<boolean> {
  const values = [
    row.log_date,
    row.garden_name,
    row.location,
    row.usda_zone,
    row.temperature,
    row.humidity,
    row.windspeed,
    row.conditions,
    row.mildew_risk,
  ]

  const rangeUrl = (range: string) =>
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`

  const appendRes = await fetch(rangeUrl('Daily Log!A1'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  })

  if (appendRes.ok) return true

  // Tab doesn't exist yet — create it with headers
  const addSheetRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Daily Log' } } }] }),
    }
  )

  if (!addSheetRes.ok) return false

  const writeRes = await fetch(rangeUrl('Daily Log!A1'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [DAILY_LOG_HEADERS, values] }),
  })

  return writeRes.ok
}

// Append a data row to a named sheet tab, creating the tab (with headers) if it doesn't exist yet
export async function appendToSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  row: SheetRowData
): Promise<boolean> {
  const values = [
    row.log_date,
    row.crop_name,
    row.variety,
    row.bed_location,
    row.observation,
    row.action_taken,
    row.ai_advice,
    row.weather_summary,
    row.full_response,
  ]

  const rangeUrl = (range: string) =>
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`

  // Try appending directly — works if the tab already exists
  const appendRes = await fetch(rangeUrl(`${sheetTitle}!A1`), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  })

  if (appendRes.ok) return true

  // Tab doesn't exist — add it
  const addSheetRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetTitle } } }] }),
    }
  )

  if (!addSheetRes.ok) return false

  // Claude chose this approach because: reading the new sheetId lets us set clip-wrap
  // on the Full Response column so it doesn't expand row height in the spreadsheet
  const addSheetData = await addSheetRes.json()
  const newSheetId = addSheetData.replies?.[0]?.addSheet?.properties?.sheetId

  // Write header row + data row
  const writeRes = await fetch(rangeUrl(`${sheetTitle}!A1`), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [HEADERS, values] }),
  })

  if (!writeRes.ok) return false

  // Set clip (no-wrap) on the Full Response column (column I, index 8) for new tabs
  if (newSheetId !== undefined) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          repeatCell: {
            range: { sheetId: newSheetId, startColumnIndex: 8, endColumnIndex: 9 },
            cell: { userEnteredFormat: { wrapStrategy: 'CLIP' } },
            fields: 'userEnteredFormat.wrapStrategy',
          },
        }],
      }),
    })
  }

  return true
}

// Share the Google Sheet (via Drive API) with a member's email address
// driveRole: 'reader' for view-only members, 'writer' for editors
export async function shareSheetWithMember(
  accessToken: string,
  spreadsheetId: string,
  email: string,
  driveRole: 'reader' | 'writer'
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'user', role: driveRole, emailAddress: email }),
      }
    )
    return res.ok
  } catch {
    return false
  }
}
