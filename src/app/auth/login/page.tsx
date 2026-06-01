'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function handleCodeLogin(e: React.FormEvent) {
    e.preventDefault()
    setVerifying(true)
    setError(null)

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.replace(/\D/g, ''),
      type: 'email',
    })

    if (error) {
      setError('That code did not work. Please check the email and try again.')
      setVerifying(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-svh bg-cream-50 flex flex-col items-center justify-center px-6">
      {/* Logo / wordmark */}
      <div className="mb-10 text-center animate-fade-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cream-200 mb-4">
          <span className="text-3xl">🌿</span>
        </div>
        <h1 className="font-serif text-3xl font-semibold text-warm-900 tracking-tight">Context</h1>
        <p className="text-warm-400 text-sm mt-1 font-sans">Your day, always within reach</p>
      </div>

      <div className="w-full max-w-sm animate-fade-up delay-100">
        {!sent ? (
          <form onSubmit={handleMagicLink} className="card p-8 space-y-5">
            <div>
              <h2 className="font-serif text-xl font-semibold text-warm-900 mb-1">Sign in</h2>
              <p className="text-warm-400 text-sm">We&apos;ll send you a link — no password needed.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-600 mb-1.5" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900 text-base
                           focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100
                           placeholder:text-warm-300 transition-colors"
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
              />
            </div>

            {error && (
              <p className="text-terracotta-500 text-sm bg-terracotta-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-3.5 rounded-xl bg-warm-700 text-cream-100 font-medium text-base
                         hover:bg-warm-900 active:scale-[0.98] transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send sign-in link'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeLogin} className="card p-8 text-center space-y-5">
            <div className="text-4xl">📬</div>
            <h2 className="font-serif text-xl font-semibold text-warm-900">Check your email</h2>
            <p className="text-warm-500 text-sm leading-relaxed">
              We sent a sign-in link to <strong className="text-warm-700">{email}</strong>.
              Tap the link, or enter the 6-digit code from the email here.
            </p>

            <div className="text-left">
              <label className="block text-sm font-medium text-warm-600 mb-1.5" htmlFor="code">
                Sign-in code
              </label>
              <input
                id="code"
                type="text"
                required
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900 text-center text-2xl tracking-[0.3em]
                           focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100
                           placeholder:text-warm-300 transition-colors"
                placeholder="000000"
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            </div>

            {error && (
              <p className="text-terracotta-500 text-sm bg-terracotta-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="w-full py-3.5 rounded-xl bg-warm-700 text-cream-100 font-medium text-base
                         hover:bg-warm-900 active:scale-[0.98] transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? 'Checking...' : 'Continue with code'}
            </button>

            <button
              type="button"
              onClick={() => { setSent(false); setEmail(''); setCode(''); setError(null) }}
              className="text-sm text-terracotta-500 underline underline-offset-2"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>

      <p className="mt-8 text-xs text-warm-300 text-center max-w-xs animate-fade-up delay-200">
        Context is a research validation app. Your data is private and protected.
      </p>
    </div>
  )
}
