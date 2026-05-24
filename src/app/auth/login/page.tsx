'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
    if (digits.length === 10) return `+1${digits}`
    return value.trim()
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      phone: formatPhone(phone),
    })

    if (error) {
      setError(error.message)
    } else {
      setCodeSent(true)
    }
    setLoading(false)
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.verifyOtp({
      phone: formatPhone(phone),
      token: code.replace(/\D/g, ''),
      type: 'sms',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
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
        {!codeSent ? (
          <form onSubmit={handleSendCode} className="card p-8 space-y-5">
            <div>
              <h2 className="font-serif text-xl font-semibold text-warm-900 mb-1">Sign in</h2>
              <p className="text-warm-400 text-sm">We&apos;ll text you a code — no password needed.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-600 mb-1.5" htmlFor="phone">
                Mobile phone
              </label>
              <input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900 text-base
                           focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100
                           placeholder:text-warm-300 transition-colors"
                placeholder="(555) 555-0100"
                autoComplete="tel"
                inputMode="tel"
              />
              <p className="text-xs text-warm-300 mt-1">US numbers only during beta.</p>
            </div>

            {error && (
              <p className="text-terracotta-500 text-sm bg-terracotta-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || phone.replace(/\D/g, '').length < 10}
              className="w-full py-3.5 rounded-xl bg-warm-700 text-cream-100 font-medium text-base
                         hover:bg-warm-900 active:scale-[0.98] transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Text me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="card p-8 space-y-5">
            <div className="text-center space-y-2">
              <div className="text-4xl">💬</div>
              <h2 className="font-serif text-xl font-semibold text-warm-900">Enter your code</h2>
              <p className="text-warm-500 text-sm leading-relaxed">
                We texted a 6-digit code to <strong className="text-warm-700">{phone}</strong>.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-600 mb-1.5" htmlFor="code">
                Text code
              </label>
              <input
                id="code"
                type="text"
                required
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900 text-2xl
                           font-mono tracking-[0.3em] text-center
                           focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100
                           placeholder:text-warm-300 transition-colors"
                placeholder="123456"
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            </div>

            {error && (
              <p className="text-terracotta-500 text-sm bg-terracotta-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full py-3.5 rounded-xl bg-warm-700 text-cream-100 font-medium text-base
                         hover:bg-warm-900 active:scale-[0.98] transition-all
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Checking...' : 'Continue'}
            </button>

            <button
              type="button"
              onClick={() => { setCodeSent(false); setCode(''); setError(null) }}
              className="w-full text-sm text-terracotta-500 underline underline-offset-2"
            >
              Use a different phone number
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
