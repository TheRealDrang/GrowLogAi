import { createSupabaseServerClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function WelcomePage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firstName = user.user_metadata?.first_name ?? 'there'

  const { data: tokenRow } = await supabase
    .from('user_google_tokens')
    .select('user_id')
    .eq('user_id', user.id)
    .single()

  const isGoogleUser = !!tokenRow

  if (isGoogleUser) {
    return (
      <div className="w-full max-w-md">
        <div className="mb-8">
          <div className="w-12 h-12 bg-moss/10 rounded-2xl flex items-center justify-center mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/seedling-icon.png" alt="" className="w-8 h-8" aria-hidden="true" />
          </div>
          <h1 className="font-serif text-3xl text-soil mb-2">
            Hi {firstName}, welcome to GrowLog.
          </h1>
          <p className="text-bark font-sans text-sm leading-relaxed">
            Let&apos;s get your garden set up. It takes about <strong>2 minutes</strong>.
          </p>
        </div>

        <div className="card p-6 mb-6 space-y-4">
          <StepPreview number={1} label="Name your garden and set your location" />
          <StepPreview number={2} label="Add your first crop" />
          <StepPreview number={3} label="Meet your AI growing advisor" />
        </div>

        <Link href="/onboarding/garden" className="btn-primary w-full text-center block">
          Set up my garden →
        </Link>
      </div>
    )
  }

  // Email/password variant — explain Sheets connection first
  return (
    <div className="w-full max-w-md">
      <div className="mb-8">
        <div className="w-12 h-12 bg-moss/10 rounded-2xl flex items-center justify-center mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/seedling-icon.png" alt="" className="w-8 h-8" aria-hidden="true" />
        </div>
        <h1 className="font-serif text-3xl text-soil mb-2">
          Hi {firstName}, welcome to GrowLog.
        </h1>
        <p className="text-bark font-sans text-sm leading-relaxed">
          Let&apos;s get you set up. It takes about <strong>3 minutes</strong>.
        </p>
      </div>

      <div className="card p-6 mb-6 space-y-4">
        <StepPreview number={1} label="Connect Google Sheets (your data, your spreadsheet)" />
        <StepPreview number={2} label="Name your garden and set your location" />
        <StepPreview number={3} label="Add your first crop" />
        <StepPreview number={4} label="Meet your AI growing advisor" />
      </div>

      <div className="bg-moss/5 border border-moss/20 rounded-xl px-4 py-3 mb-6">
        <p className="text-xs font-sans text-bark leading-relaxed">
          <strong className="text-soil">Why Google Sheets?</strong>{' '}
          Every conversation with your advisor logs automatically to a spreadsheet you own.
          GrowLog only reads and writes to sheets you create — nothing else in your Drive is touched.
        </p>
      </div>

      <Link href="/onboarding/sheets" className="btn-primary w-full text-center block">
        Connect Google Sheets →
      </Link>
    </div>
  )
}

function StepPreview({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 h-6 rounded-full bg-moss/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-xs font-sans font-semibold text-moss">{number}</span>
      </div>
      <p className="text-sm font-sans text-bark leading-relaxed">{label}</p>
    </div>
  )
}
