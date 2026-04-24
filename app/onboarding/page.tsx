'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BottomNav from '@/components/BottomNav'

const STEPS = [
  { id: 1, title: 'Open your sheet' },
  { id: 2, title: 'Open Apps Script' },
  { id: 3, title: 'Paste the script' },
  { id: 4, title: 'Deploy it' },
  { id: 5, title: 'Save the URL' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [sheetUrl, setSheetUrl] = useState('')

  function saveAndFinish() {
    router.push('/settings')
  }

  return (
    <div className="min-h-screen bg-straw pb-24 md:pb-0">
      <header className="bg-parchment border-b border-sage/30 px-5 py-4 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/settings" className="text-bark hover:text-soil transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <h1 className="font-serif text-lg text-soil">Set up Google Sheets</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8">
        <p className="text-bark text-sm font-sans mb-6">
          Connect a Google Sheet and every chat session will automatically log a row — date, crop, what you observed, and what your advisor recommended.
        </p>

        {/* Step progress dots */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full text-xs font-sans font-semibold flex items-center justify-center transition-colors ${
                step > s.id  ? 'bg-moss text-parchment' :
                step === s.id ? 'bg-moss/20 border-2 border-moss text-moss' :
                'bg-sage/20 text-bark/50'
              }`}>
                {step > s.id ? '✓' : s.id}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px w-6 ${step > s.id ? 'bg-moss/40' : 'bg-sage/30'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="card p-7">
          {step === 1 && (
            <StepCard
              step={1}
              title="Open your Google Sheet"
              onNext={() => setStep(2)}
            >
              <p className="text-bark text-sm font-sans leading-relaxed">
                Go to <strong>Google Sheets</strong> and open the spreadsheet where you want GrowLog to log sessions.
                If you don&apos;t have one yet, create a new blank spreadsheet — GrowLog will create the tabs automatically.
              </p>
            </StepCard>
          )}

          {step === 2 && (
            <StepCard step={2} title="Open Apps Script" onNext={() => setStep(3)} onBack={() => setStep(1)}>
              <p className="text-bark text-sm font-sans leading-relaxed">
                In your Google Sheet, click the menu: <strong>Extensions → Apps Script</strong>.
                A new browser tab will open with a code editor.
              </p>
            </StepCard>
          )}

          {step === 3 && (
            <StepCard step={3} title="Paste the script" onNext={() => setStep(4)} onBack={() => setStep(2)}>
              <div className="space-y-3 text-sm font-sans text-bark leading-relaxed">
                <p>In the Apps Script editor:</p>
                <ol className="list-decimal list-inside space-y-2 ml-1">
                  <li>Select all existing code (Cmd+A) and delete it</li>
                  <li>Open the file <code className="bg-straw px-1.5 py-0.5 rounded text-xs font-mono text-soil">scripts/apps-script-template.gs</code> from this project and copy its contents</li>
                  <li>Paste into the editor</li>
                  <li>Change the <code className="bg-straw px-1.5 py-0.5 rounded text-xs font-mono text-soil">SECRET_TOKEN</code> on line 1 to any private phrase you choose</li>
                  <li>Press <strong>Cmd+S</strong> to save</li>
                </ol>
                <div className="bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 text-harvest text-xs mt-3">
                  Remember the token you set — you&apos;ll enter the same value in your garden settings.
                </div>
              </div>
            </StepCard>
          )}

          {step === 4 && (
            <StepCard step={4} title="Deploy as a web app" onNext={() => setStep(5)} onBack={() => setStep(3)}>
              <ol className="list-decimal list-inside space-y-2.5 text-sm font-sans text-bark leading-relaxed ml-1">
                <li>Click <strong>Deploy</strong> (top right) → <strong>New deployment</strong></li>
                <li>Click the gear icon next to &ldquo;Type&rdquo; → select <strong>Web app</strong></li>
                <li>Set &ldquo;Execute as&rdquo; → <strong>Me</strong></li>
                <li>Set &ldquo;Who has access&rdquo; → <strong>Anyone</strong></li>
                <li>Click <strong>Deploy</strong> and authorize when prompted</li>
                <li>Copy the <strong>Web app URL</strong> — it ends in <code className="bg-straw px-1 rounded text-xs font-mono text-soil">/exec</code></li>
              </ol>
              <div className="bg-sky/20 border border-sky/40 rounded-xl px-4 py-3 text-soil text-xs mt-4 font-sans">
                To verify it&apos;s working: paste the URL into a new browser tab. You should see{' '}
                <code className="font-mono">{`{"ok":true}`}</code>.
              </div>
            </StepCard>
          )}

          {step === 5 && (
            <div>
              <p className="text-xs font-sans uppercase tracking-wide text-bark font-medium mb-1">Step 5 of 5</p>
              <h2 className="font-serif text-xl text-soil mb-4">Save your URL</h2>
              <p className="text-bark text-sm font-sans mb-4 leading-relaxed">
                Paste your web app URL here. You&apos;ll finish saving it on the Settings page.
              </p>

              <label className="label">Web app URL</label>
              <input
                type="url"
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                className="input mb-5"
                placeholder="https://script.google.com/macros/s/…/exec"
              />

              <div className="flex gap-3">
                <button onClick={() => setStep(4)} className="btn-ghost flex-1">Back</button>
                <button
                  onClick={saveAndFinish}
                  disabled={!sheetUrl}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  Save in Settings →
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-bark/50 font-sans mt-6">
          <Link href="/settings" className="hover:text-bark transition-colors">Skip for now</Link>
        </p>
      </main>

      <BottomNav />
    </div>
  )
}

function StepCard({
  step,
  title,
  children,
  onNext,
  onBack,
}: {
  step: number
  title: string
  children: React.ReactNode
  onNext: () => void
  onBack?: () => void
}) {
  return (
    <div>
      <p className="text-xs font-sans uppercase tracking-wide text-bark font-medium mb-1">Step {step} of 5</p>
      <h2 className="font-serif text-xl text-soil mb-4">{title}</h2>
      <div className="mb-6">{children}</div>
      <div className="flex gap-3">
        {onBack && <button onClick={onBack} className="btn-ghost flex-1">Back</button>}
        <button onClick={onNext} className="btn-primary flex-1">Continue</button>
      </div>
    </div>
  )
}
