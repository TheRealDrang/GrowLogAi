'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // The auth callback verifies the recovery token and sets a session
    // before redirecting here. If there's no session, the link has expired.
    const supabase = createSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/forgot-password')
      } else {
        setReady(true)
      }
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    setError(null)

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError('Could not update your password. The reset link may have expired — please request a new one.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  // Wait for session check before showing the form
  if (!ready) return null

  return (
    <div className="min-h-screen bg-straw flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-parchment rounded-2xl mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/seedling-icon.png" alt="" className="w-10 h-10" aria-hidden="true" />
          </div>
          <h1 className="font-serif text-3xl text-soil">Choose a new password</h1>
          <p className="text-bark text-sm mt-1 font-sans">Make it something you&apos;ll remember</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">New password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="At least 8 characters"
                minLength={8}
              />
            </div>

            <div>
              <label className="label">Confirm new password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="input"
                placeholder="Same password again"
              />
            </div>

            {error && (
              <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-bark font-sans mt-6">
          <Link href="/login" className="text-moss font-medium hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
