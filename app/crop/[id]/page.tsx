import { createSupabaseServerClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import CropChatClient from './CropChatClient'
import EditCropModal from '@/components/EditCropModal'

export default async function CropPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: crop } = await supabase
    .from('crops')
    .select('*, gardens(id, name, location, usda_zone)')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!crop) notFound()

  const { data: history } = await supabase
    .from('conversations')
    .select('role, content, created_at')
    .eq('crop_id', params.id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const { data: sessionLogs } = await supabase
    .from('session_logs')
    .select('id, log_date, observation, ai_advice, sheet_posted')
    .eq('crop_id', params.id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

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

          <EditCropModal crop={crop} />
        </div>
      </header>

      {/* Chat body — scrolls independently */}
      <CropChatClient
        cropId={params.id}
        initialHistory={(history ?? []).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))}
        sessionLogs={sessionLogs ?? []}
        cropName={crop.name}
        sowDate={crop.sow_date}
      />

      {/* No BottomNav on chat page — input bar owns the bottom */}
    </div>
  )
}
