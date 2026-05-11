import { createSupabaseServerClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import CropCard from '@/components/CropCard'
import NewCropModal from '@/components/NewCropModal'
import BottomNav from '@/components/BottomNav'
import DirtFooter from '@/components/DirtFooter'
import TooltipTip from '@/components/TooltipTip'

export default async function GardenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: garden } = await supabase
    .from('gardens')
    .select('*')
    .eq('id', id)
    .single()

  if (!garden) notFound()

  const { data: crops } = await supabase
    .from('crops')
    .select('*')
    .eq('garden_id', id)
    .order('created_at', { ascending: true })

  const cropCount = crops?.length ?? 0

  return (
    <div className="min-h-screen bg-straw flex flex-col pb-24 md:pb-0">
      {/* Sticky header */}
      <header className="bg-moss px-5 py-4 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/dashboard" className="text-parchment/70 hover:text-parchment transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 className="w-5 h-5">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-serif text-lg text-parchment truncate">{garden.name}</h1>
            {(garden.location || garden.usda_zone) && (
              <p className="text-xs text-parchment/70 font-sans truncate">
                {[garden.location, garden.usda_zone ? `Zone ${garden.usda_zone}` : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <Link href="/settings" className="text-parchment/70 hover:text-parchment transition-colors hidden sm:block">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-5 py-8 w-full">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-serif text-2xl text-soil">Crops</h2>
            <p className="text-xs font-mono text-bark mt-1">{cropCount} / 20</p>
          </div>
          {cropCount < 20
            ? <NewCropModal gardenId={garden.id} />
            : (
              <span className="text-xs font-sans text-harvest bg-harvest/10 border border-harvest/20 rounded-full px-3 py-1.5">
                Garden full
              </span>
            )
          }
        </div>

        {(!crops || crops.length === 0) ? (
          <div className="card p-12 text-center">
            <div className="w-16 h-16 bg-sage/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
                   className="w-8 h-8 text-sage">
                <path d="M12 22V12M12 12C12 12 7.5 8.5 7.5 5a4.5 4.5 0 019 0C16.5 8.5 12 12 12 12z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="font-serif text-lg text-soil mb-2">Nothing planted yet</h3>
            <p className="text-bark text-sm font-sans mb-6 max-w-xs mx-auto">
              Track your first crop to start a conversation with your garden advisor.
            </p>
            <NewCropModal gardenId={garden.id} />
            <div className="mt-4">
              <TooltipTip
                tooltipId="create-crop"
                message="Add your first crop. You can track its progress, chat with the AI, and log observations."
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {crops.map((crop) => (
              <CropCard key={crop.id} crop={crop} />
            ))}
          </div>
        )}
      </main>

      <DirtFooter />
      <BottomNav gardenId={garden.id} />
    </div>
  )
}
