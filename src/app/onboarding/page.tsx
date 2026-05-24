'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { trackClientEvent } from '@/lib/client-analytics'
import type { UserRole } from '@/types'

type Step = 'role' | 'profile'

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('role')
  const [role, setRole] = useState<UserRole | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) return
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // Normalize phone to E.164
    const cleanPhone = phone.replace(/\D/g, '')
    const phoneE164 = cleanPhone ? `+1${cleanPhone}` : null

    const { data: profile, error: insertError } = await supabase.from('profiles').insert({
      user_id: user.id,
      role,
      display_name: displayName.trim(),
      phone_e164: phoneE164,
      timezone,
    }).select('id').single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    trackClientEvent('profile_created', {
      profile_id: profile?.id,
      role,
      has_phone: Boolean(phoneE164),
      timezone,
    })

    router.push('/onboarding/household')
  }

  return (
    <div className="min-h-svh bg-cream-50 flex flex-col px-6 py-12">
      <div className="max-w-sm mx-auto w-full space-y-8">

        {/* Header */}
        <div className="animate-fade-up">
          <div className="text-3xl mb-3">🌿</div>
          <h1 className="font-serif text-2xl font-semibold text-warm-900">Welcome to Context</h1>
          <p className="text-warm-400 text-sm mt-1">Let's get you set up in about a minute.</p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 animate-fade-up delay-100">
          {(['role', 'profile'] as Step[]).map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-pill transition-colors ${
              s === step || (step === 'profile' && i === 0) ? 'bg-warm-700' : 'bg-cream-300'
            }`} />
          ))}
        </div>

        {step === 'role' && (
          <div className="space-y-4 animate-fade-up delay-200">
            <p className="font-serif text-lg text-warm-800">Who are you in this household?</p>

            <button
              onClick={() => { setRole('mci_user'); setStep('profile') }}
              className="w-full card p-5 text-left hover:shadow-float active:scale-[0.98] transition-all border-2 border-transparent hover:border-sage-300"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">🧑‍🦳</span>
                <div>
                  <p className="font-medium text-warm-900">I'm the primary member</p>
                  <p className="text-sm text-warm-400 mt-0.5">I'll log my own activities and use re-entry cards</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => { setRole('care_partner'); setStep('profile') }}
              className="w-full card p-5 text-left hover:shadow-float active:scale-[0.98] transition-all border-2 border-transparent hover:border-sage-300"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">🤝</span>
                <div>
                  <p className="font-medium text-warm-900">I'm a care partner</p>
                  <p className="text-sm text-warm-400 mt-0.5">I'll receive daily summaries and monitor activity</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {step === 'profile' && (
          <form onSubmit={handleSubmit} className="space-y-5 animate-fade-up">
            <p className="font-serif text-lg text-warm-800">Tell us a little about yourself</p>

            <div>
              <label className="block text-sm font-medium text-warm-600 mb-1.5">Your first name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900 text-base
                           focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100"
                placeholder="e.g. Margaret"
                autoComplete="given-name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-warm-600 mb-1.5">
                Mobile phone <span className="text-warm-300 font-normal">(for SMS reminders)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900 text-base
                           focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100"
                placeholder="(555) 555-0100"
                autoComplete="tel"
                inputMode="tel"
              />
              <p className="text-xs text-warm-300 mt-1">US numbers only during beta. Optional but recommended.</p>
            </div>

            {error && (
              <p className="text-terracotta-500 text-sm bg-terracotta-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('role')}
                className="px-4 py-3 rounded-xl border border-cream-300 text-warm-500 font-medium text-sm hover:bg-cream-100 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading || !displayName.trim()}
                className="flex-1 py-3 rounded-xl bg-warm-700 text-cream-100 font-medium text-base
                           hover:bg-warm-900 active:scale-[0.98] transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
