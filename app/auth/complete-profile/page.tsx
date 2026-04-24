'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function CompleteProfilePage() {
  const [firstName, setFirstName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!firstName.trim()) {
      setError('Please enter your first name.')
      return
    }

    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({
      data: { first_name: firstName.trim() },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-straw flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-moss/10 border border-sage/40 rounded-2xl mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
                 className="w-7 h-7 text-moss">
              <path d="M12 22V12" strokeLinecap="round"/>
              <path d="M12 12C12 12 7 8 7 4.5a5 5 0 0110 0C17 8 12 12 12 12z"
                    strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="font-serif text-3xl text-soil">One last thing</h1>
          <p className="text-bark text-sm mt-1 font-sans">What should we call you?</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">First name</label>
              <input
                type="text"
                required
                autoComplete="given-name"
                autoFocus
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="input"
                placeholder="Your first name"
              />
            </div>

            {error && (
              <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Saving…' : 'Continue to dashboard'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
