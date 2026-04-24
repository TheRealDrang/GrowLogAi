/**
 * GrowLog AI — Google Apps Script Template
 *
 * HOW TO SET UP:
 * 1. Open your Google Sheet
 * 2. Click Extensions → Apps Script
 * 3. Delete any existing code and paste this entire file
 * 4. Click Save (floppy disk icon)
 * 5. Click Deploy → New deployment
 * 6. Type: Web app
 * 7. Set "Execute as" → Me
 * 8. Set "Who has access" → Anyone  (GrowLog AI uses a secret token to authenticate)
 * 9. Click Deploy → Authorize → Copy the web app URL
 * 10. Paste that URL into GrowLog AI → Settings → Google Sheet URL
 *
 * The sheet will automatically create one tab per garden.
 * Each session log adds one row with date, crop, observations, and AI advice.
 */

// Change this to any secret string — paste the same value nowhere else.
// GrowLog AI will send this in every request so only your script accepts it.
var SECRET_TOKEN = "change-me-to-something-secret";

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Verify token
    if (data.token !== SECRET_TOKEN) {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: "Unauthorized" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = (data.crop_name || data.garden_name || "GrowLog").replace(/[^\w\s-]/g, "").trim();

    // Get or create tab for this garden
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      // Write header row
      sheet.appendRow([
        "Date",
        "Crop",
        "Variety",
        "Bed",
        "Observation",
        "Action Taken",
        "AI Advice",
        "Weather",
        "Logged At"
      ]);
      sheet.getRange(1, 1, 1, 9).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    // Append data row
    sheet.appendRow([
      data.log_date || new Date().toISOString().split("T")[0],
      data.crop_name || "",
      data.variety || "",
      data.bed_location || "",
      data.observation || "",
      data.action_taken || "",
      data.ai_advice || "",
      data.weather_summary || "",
      new Date().toISOString()
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// Test endpoint — visit the web app URL in a browser to confirm it's running
function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, message: "GrowLog AI sheet logger is running." })
  ).setMimeType(ContentService.MimeType.JSON);
}
