'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function SignupPage() {
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("Passwords don't match — double-check and try again.")
      return
    }
    if (password.length < 8) {
      setError('Password needs to be at least 8 characters.')
      return
    }
    if (!firstName.trim()) {
      setError('Please enter your first name.')
      return
    }

    setLoading(true)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
        data: { first_name: firstName.trim() },
      },
    })

    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('already registered') || msg.includes('already exists')) {
        setError('An account with that email already exists. Try signing in instead.')
      } else if (msg.includes('rate limit') || msg.includes('too many')) {
        setError('Too many attempts — please wait a few minutes and try again.')
      } else if (msg.includes('invalid') && msg.includes('email')) {
        setError('That doesn\'t look like a valid email address.')
      } else {
        setError('Something went wrong creating your account — please try again.')
      }
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)
  }

  async function handleGoogleSignUp() {
    setGoogleLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Request Sheets + Drive scopes so we can auto-log to the user's Google Sheet
        scopes: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          // Always prompt so refresh_token is included
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    if (error) {
      setError('Could not start Google sign-up — please try again.')
      setGoogleLoading(false)
    }
    // Page redirects to Google; no further action needed here
  }

  if (done) {
    return (
      <div className="min-h-screen bg-straw flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="card p-10">
            <div className="text-4xl mb-4">📬</div>
            <h2 className="font-serif text-2xl text-soil mb-2">Check your email</h2>
            <p className="text-bark text-sm font-sans leading-relaxed">
              We sent a confirmation link to <strong>{email}</strong>.
              Click it to activate your account, then come back to sign in.
            </p>
            <Link href="/login" className="inline-block mt-6 text-moss font-sans font-medium hover:underline">
              Back to sign in →
            </Link>
          </div>
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
          <h1 className="font-serif text-3xl text-soil">GrowLog AI</h1>
          <p className="text-bark text-sm mt-1 font-sans">Let&apos;s get your garden set up</p>
        </div>

        <div className="card p-8 space-y-5">
          {/* Google sign-up */}
          <button
            onClick={handleGoogleSignUp}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-parchment hover:bg-straw
                       border border-sage/50 hover:border-sage rounded-xl px-4 py-3 text-sm
                       font-sans font-medium text-soil transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-sage/30" />
            <span className="text-xs text-bark/50 font-sans">or</span>
            <div className="flex-1 h-px bg-sage/30" />
          </div>

          {/* Email/password form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">First name</label>
              <input
                type="text"
                required
                autoComplete="given-name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="input"
                placeholder="Your first name"
              />
            </div>

            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label className="label">Confirm password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-harvest text-sm bg-harvest/8 border border-harvest/20 rounded-xl px-4 py-3 font-sans">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Creating your account…' : 'Create account with email'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-bark font-sans mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-moss font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
