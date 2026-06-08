'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { normalizePhone } from '@/lib/sms'
import type { EmailOtpType } from '@supabase/supabase-js'

type AuthMode = 'signin' | 'signup'
type DeliveryMethod = 'email' | 'phone'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('signin')
  const [identifier, setIdentifier] = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('phone')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const trimmedIdentifier = identifier.trim()
  const isEmail = trimmedIdentifier.includes('@')
  const destination = isEmail ? trimmedIdentifier.toLowerCase() : normalizePhone(trimmedIdentifier)

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = isEmail
      ? await supabase.auth.signInWithOtp({
          email: destination,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback`,
            shouldCreateUser: mode === 'signup',
          },
        })
      : await supabase.auth.signInWithOtp({
          phone: destination,
          options: {
            shouldCreateUser: mode === 'signup',
          },
        })

    if (error) {
      if (mode === 'signin' && error.message.toLowerCase().includes('signups not allowed')) {
        setError('We could not find that account. Check the number or email, or choose Create account.')
      } else {
        setError(error.message)
      }
    } else {
      setDeliveryMethod(isEmail ? 'email' : 'phone')
      setSent(true)
    }
    setLoading(false)
  }

  async function handleCodeLogin(e: React.FormEvent) {
    e.preventDefault()
    setVerifying(true)
    setError(null)

    const token = code.replace(/\D/g, '')
    if (deliveryMethod === 'phone') {
      const { error } = await supabase.auth.verifyOtp({
        phone: destination,
        token,
        type: 'sms',
      })

      if (!error) {
        router.push('/')
        router.refresh()
        return
      }

      setError(error.message || 'That code did not work. Please check the text message and try again.')
      setVerifying(false)
      return
    }

    const otpTypes: EmailOtpType[] = ['email', 'signup', 'magiclink']
    let lastError: Error | null = null

    for (const type of otpTypes) {
      const { error } = await supabase.auth.verifyOtp({
        email: destination,
        token,
        type,
      })
      if (!error) {
        router.push('/')
        router.refresh()
        return
      }
      lastError = error
    }

    setError(lastError?.message || 'That code did not work. Please check the email and try again.')
    setVerifying(false)
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
          <form onSubmit={handleSendCode} className="card p-8 space-y-5">
            <div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-cream-100 p-1 mb-5" aria-label="Account action">
                {(['signin', 'signup'] as AuthMode[]).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setMode(option)
                      setError(null)
                    }}
                    className={`min-h-11 rounded-lg px-3 text-sm font-medium transition-colors ${
                      mode === option ? 'bg-white text-warm-900 shadow-soft' : 'text-warm-500'
                    }`}
                  >
                    {option === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>
              <h2 className="font-serif text-xl font-semibold text-warm-900 mb-1">
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="text-warm-400 text-sm">
                Enter your mobile number or email. No password needed.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-600 mb-1.5" htmlFor="identifier">
                Mobile number or email
              </label>
              <input
                id="identifier"
                type="text"
                required
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900 text-base
                           focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100
                           placeholder:text-warm-300 transition-colors"
                placeholder="(555) 555-0100 or you@example.com"
                autoComplete="username"
              />
            </div>

            {error && (
              <p className="text-terracotta-500 text-sm bg-terracotta-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !trimmedIdentifier}
              className="w-full py-3.5 rounded-xl bg-warm-700 text-cream-100 font-medium text-base
                         hover:bg-warm-900 active:scale-[0.98] transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : isEmail ? 'Send email code and link' : 'Send text code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeLogin} className="card p-8 text-center space-y-5">
            <div className="text-4xl">{deliveryMethod === 'email' ? '📬' : '💬'}</div>
            <h2 className="font-serif text-xl font-semibold text-warm-900">
              Check your {deliveryMethod === 'email' ? 'email' : 'texts'}
            </h2>
            <p className="text-warm-500 text-sm leading-relaxed">
              {deliveryMethod === 'email' ? (
                <>
                  We sent a sign-in link and code to <strong className="text-warm-700">{destination}</strong>.
                  Tap the link, or enter the code here.
                </>
              ) : (
                <>
                  We sent a six-digit sign-in code to <strong className="text-warm-700">{destination}</strong>.
                </>
              )}
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
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, deliveryMethod === 'phone' ? 6 : 8))}
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
              disabled={verifying || code.length < 6}
              className="w-full py-3.5 rounded-xl bg-warm-700 text-cream-100 font-medium text-base
                         hover:bg-warm-900 active:scale-[0.98] transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? 'Checking...' : 'Continue with code'}
            </button>

            <button
              type="button"
              onClick={() => { setSent(false); setIdentifier(''); setCode(''); setError(null) }}
              className="text-sm text-terracotta-500 underline underline-offset-2"
            >
              Use a different number or email
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
