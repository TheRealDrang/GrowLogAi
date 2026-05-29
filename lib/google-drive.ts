// Google Drive helpers — photo backup for chat images.
// Uses the drive.file scope already granted during Google OAuth.

import { fetchWithTimeout } from './fetch-timeout'
import { createSupabaseAdminClient } from './supabase'

// Create a folder in Drive and return its file ID
async function createDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string | null> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) metadata.parents = [parentId]

  try {
    const res = await fetchWithTimeout(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      },
      10000
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.id ?? null
  } catch {
    return null
  }
}

// Ensure the GrowLog AI / [gardenName] folder structure exists.
// Returns the garden subfolder ID, using the cached existingFolderId when available.
// Claude chose this approach because: drive.file scope can't search existing files,
// so we always create and cache the first time rather than trying to search.
export async function getOrCreateGrowLogFolder(
  accessToken: string,
  gardenName: string,
  gardenId: string,
  existingFolderId: string | null
): Promise<string | null> {
  if (existingFolderId) return existingFolderId

  const rootId = await createDriveFolder(accessToken, 'GrowLog AI')
  if (!rootId) return null

  const gardenFolderId = await createDriveFolder(accessToken, gardenName, rootId)
  if (!gardenFolderId) return null

  // Cache the folder ID so we skip creation on subsequent uploads
  await createSupabaseAdminClient()
    .from('gardens')
    .update({ drive_folder_id: gardenFolderId })
    .eq('id', gardenId)

  return gardenFolderId
}

// Upload a JPEG image (base64) to Drive and return the public webViewLink.
// Sets an anyone/reader permission so the link works without sign-in.
export async function uploadImageToDrive(
  accessToken: string,
  base64data: string,
  filename: string,
  folderId: string
): Promise<string | null> {
  const boundary = 'GrowLogDriveBoundary'
  const metadata = JSON.stringify({ name: filename, parents: [folderId] })

  // Convert base64 to binary bytes
  const binaryStr = atob(base64data)
  const imageBytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) imageBytes[i] = binaryStr.charCodeAt(i)

  // Build multipart/related body
  const encoder = new TextEncoder()
  const metaPart = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`)
  const imageHeader = encoder.encode(`--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`)
  const closing = encoder.encode(`\r\n--${boundary}--`)

  const body = new Uint8Array(metaPart.length + imageHeader.length + imageBytes.length + closing.length)
  let offset = 0
  body.set(metaPart, offset); offset += metaPart.length
  body.set(imageHeader, offset); offset += imageHeader.length
  body.set(imageBytes, offset); offset += imageBytes.length
  body.set(closing, offset)

  try {
    const uploadRes = await fetchWithTimeout(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
      20000
    )
    if (!uploadRes.ok) {
      console.error('[drive upload error]', await uploadRes.text())
      return null
    }

    const fileData = await uploadRes.json()
    const fileId: string | undefined = fileData.id
    if (!fileId) return null

    // Make the file publicly viewable via link (no sign-in required)
    await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'anyone', role: 'reader' }),
      },
      8000
    )

    return fileData.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`
  } catch (err) {
    console.error('[drive upload exception]', err)
    return null
  }
}

// Build a contextual filename from crop name and the first 5 words of the observation.
// Example: tomatoes-yellowing-leaves-on-lower-2026-05-29.jpg
export function buildDriveFilename(cropName: string, observation: string | null): string {
  const slug = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const cropSlug = slug(cropName)
  const date = new Date().toISOString().split('T')[0]

  if (observation) {
    const words = observation.trim().split(/\s+/).slice(0, 5).join(' ')
    const obsSlug = slug(words)
    if (obsSlug) return `${cropSlug}-${obsSlug}-${date}.jpg`
  }
  return `${cropSlug}-photo-${date}.jpg`
}
