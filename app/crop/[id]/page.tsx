import { createSupabaseServerClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import CropChatClient from './CropChatClient'
import EditCropModal from '@/components/EditCropModal'

const INITIAL_HISTORY_LIMIT = 50

export default async function CropPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ alert?: string }>
}) {
  const { id } = await params
  const resolvedSearch = await searchParams
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: crop } = await supabase
    .from('crops')
    .select('*, gardens(id, name, location, usda_zone)')
    .eq('id', id)
    .single()

  if (!crop) notFound()

  const { data: history } = await supabase
    .from('conversations')
    .select('role, content, created_at, created_by, drive_photo_url')
    .eq('crop_id', id)
    .order('created_at', { ascending: false })
    .limit(INITIAL_HISTORY_LIMIT)

  const { data: sessionLogs } = await supabase
    .from('session_logs')
    .select('id, log_date, observation, ai_advice, sheet_posted, full_response, created_by')
    .eq('crop_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Collect all user IDs that appear in this crop's history and logs, then fetch display names
  const memberIds = new Set<string>([user.id])
  ;(history ?? []).forEach(m => { if (m.created_by) memberIds.add(m.created_by) })
  ;(sessionLogs ?? []).forEach(l => { if (l.created_by) memberIds.add(l.created_by) })

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', [...memberIds])

  const profileMap: Record<string, string> = {}
  ;(profileRows ?? []).forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

  const currentUserDisplayName = profileMap[user.id]

  // Read optional ?alert=[id] param — used when navigating from an Advisor Note
  const alertId = resolvedSearch?.alert ?? null
  let alertContext: string | null = null
  if (alertId) {
    const { data: alertRow } = await supabase
      .from('garden_alerts')
      .select('chat_context')
      .eq('id', alertId)
      .single()
    alertContext = alertRow?.chat_context ?? null
  }

  const garden = crop.gardens as { id: string; name: string; location: string | null; usda_zone: string | null }

  return (
    // Full-height flex column — header is sticky, chat body scrolls independently
    <div className="h-screen flex flex-col bg-straw overflow-hidden">
      {/* Sticky header — always visible even in long chats */}
      <header className="bg-moss px-5 py-3 flex-shrink-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href={`/garden/${garden.id}`} className="text-parchment/70 hover:text-parchment transition-colors flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 className="w-5 h-5">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-base text-parchment truncate">{crop.name}</h1>
              {crop.variety && (
                <span className="text-xs text-parchment/60 font-sans truncate hidden sm:inline">{crop.variety}</span>
              )}
              <span className={`flex-shrink-0 text-xs font-sans font-medium px-2 py-0.5 rounded-full ${
                crop.status === 'growing'   ? 'bg-parchment/20 text-parchment' :
                crop.status === 'harvested' ? 'bg-harvest/30 text-harvest-light' :
                'bg-parchment/10 text-parchment/60'
              }`}>
                {crop.status}
              </span>
            </div>
            {crop.bed_location && (
              <p className="text-xs text-parchment/60 font-sans truncate">{crop.bed_location}</p>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <a
              href="https://www.notion.so/GrowLog-AI-Knowledge-Base-36dcc739f5188098b8fcfe6b47be706b"
              target="_blank"
              rel="noopener noreferrer"
              className="text-parchment/70 hover:text-parchment transition-colors"
              title="Knowledge Base"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
            <EditCropModal crop={crop} gardenId={garden.id} />
          </div>
        </div>
      </header>

      {/* Chat body — scrolls independently */}
      <CropChatClient
        cropId={id}
        initialHistory={(history ?? []).reverse().map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          attributedTo: m.role === 'user' && m.created_by ? profileMap[m.created_by] : undefined,
          drivePhotoUrl: m.drive_photo_url ?? undefined,
        }))}
        sessionLogs={(sessionLogs ?? []).map(l => ({
          ...l,
          createdByName: l.created_by ? profileMap[l.created_by] : undefined,
        }))}
        cropName={crop.name}
        sowDate={crop.sow_date}
        currentUserDisplayName={currentUserDisplayName}
        alertContext={alertContext}
      />

      {/* No BottomNav on chat page — input bar owns the bottom */}
    </div>
  )
}
