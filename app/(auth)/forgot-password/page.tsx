'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // redirectTo is used by Supabase as a fallback; our email template
      // uses token_hash which routes through /auth/callback directly.
      redirectTo: `${window.location.origin}/auth/callback`,
    })

    if (error) {
      setError('Something went wrong — please try again.')
      setLoading(false)
      return
    }

    // Always show success — don't reveal whether the email exists
    setSubmitted(true)
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-straw flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-parchment rounded-2xl mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/seedling-icon.png" alt="" className="w-10 h-10" aria-hidden="true" />
            </div>
            <h1 className="font-serif text-3xl text-soil">Check your inbox</h1>
            <p className="text-bark text-sm mt-1 font-sans">A reset link is on its way</p>
          </div>

          <div className="card p-8">
            <p className="text-soil text-sm font-sans leading-relaxed mb-6">
              If <strong>{email}</strong> is registered with GrowLog AI, you&apos;ll receive a
              password reset link within a few minutes. The link expires in 1 hour.
            </p>
            <p className="text-bark text-xs font-sans leading-relaxed">
              Didn&apos;t get it? Check your spam folder, or{' '}
              <button
                onClick={() => setSubmitted(false)}
                className="text-moss font-medium hover:underline"
              >
                try a different email
              </button>
              .
            </p>
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

  return (
    <div className="min-h-screen bg-straw flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-parchment rounded-2xl mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/seedling-icon.png" alt="" className="w-10 h-10" aria-hidden="true" />
          </div>
          <h1 className="font-serif text-3xl text-soil">Reset password</h1>
          <p className="text-bark text-sm mt-1 font-sans">We&apos;ll send you a link to reset it</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
            </div>

            {error && (
              <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Sending…' : 'Send reset link'}
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
