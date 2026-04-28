'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

// Translates raw Supabase/OAuth error strings into plain English
function friendlyCallbackError(detail: string | null): string | null {
  if (!detail) return 'Sign-in failed — please try again.'
  const d = detail.toLowerCase()
  if (d.includes('identity') && d.includes('already')) {
    return 'That Google account is already connected to a different GrowLog account. Try signing in with that account, or use a different Google account.'
  }
  if (d.includes('code challenge') || d.includes('code verifier')) {
    return 'Your sign-in link expired. Please sign in again.'
  }
  if (d === 'no_code_or_token') {
    return 'Something went wrong during sign-in. Please try again.'
  }
  if (d.includes('email') && d.includes('confirm')) {
    return 'Please confirm your email address before signing in — check your inbox for the link we sent.'
  }
  return 'Sign-in failed — please try again. If this keeps happening, contact support.'
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(() => {
    // Read error passed from auth callback via URL params
    const hasCallbackError = searchParams.get('error') === 'auth_callback_failed'
    return hasCallbackError ? friendlyCallbackError(searchParams.get('detail')) : null
  })
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError("We couldn't sign you in — check your email and password and try again.")
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true)
    setError(null)
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/drive.file',
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) {
      setError('Could not start Google sign-in — please try again.')
      setGoogleLoading(false)
    }
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
          <p className="text-bark text-sm mt-1 font-sans">Welcome back to your garden</p>
        </div>

        <div className="card p-8 space-y-5">
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-parchment hover:bg-straw
                       border border-sage/50 hover:border-sage rounded-xl px-4 py-3 text-sm
                       font-sans font-medium text-soil transition-colors disabled:opacity-50"
          >
            <GoogleIcon />
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-sage/30" />
            <span className="text-xs text-bark/50 font-sans">or</span>
            <div className="flex-1 h-px bg-sage/30" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
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
                value={password}
                onChange={e => setPassword(e.target.value)}
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
              {loading ? 'Signing in…' : 'Sign in with email'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-bark font-sans mt-6">
          New to GrowLog?{' '}
          <Link href="/signup" className="text-moss font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
