'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { normalizePhone } from '@/lib/sms'
import type { Profile } from '@/types'

interface Props {
  profile: Profile
  onClose: () => void
  onSignOut: () => void
}

const GAP_OPTIONS = [
  { value: 30,  label: '30 minutes' },
  { value: 60,  label: '1 hour' },
  { value: 90,  label: '1.5 hours' },
  { value: 120, label: '2 hours' },
  { value: 180, label: '3 hours' },
  { value: 240, label: '4 hours' },
]

const DEFAULT_SUMMARY_TIME = '21:00'

export default function ReminderSettings({ profile, onClose, onSignOut }: Props) {
  const supabase = createClient()
  const [gap, setGap] = useState(profile.reminder_gap_minutes)
  const [summaryTime, setSummaryTime] = useState(profile.daily_summary_time || DEFAULT_SUMMARY_TIME)
  const [phone, setPhone] = useState(profile.phone_e164 ?? '')
  const [smsConsent, setSmsConsent] = useState(Boolean(profile.phone_e164))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    const phoneValue = phone.trim()
    const phoneE164 = phoneValue ? normalizePhone(phoneValue) : null

    if (phoneE164 && !smsConsent) {
      setError('Please check the SMS consent box to receive text reminders, or leave the phone number blank.')
      return
    }

    setError(null)
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ reminder_gap_minutes: gap, daily_summary_time: summaryTime, phone_e164: phoneE164 })
      .eq('id', profile.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-warm-900/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg mx-auto bg-cream-50 rounded-t-3xl sm:rounded-3xl pt-2 pb-10 px-6 shadow-float animate-fade-up max-h-[92svh] overflow-y-auto">
        <div className="w-10 h-1 bg-warm-300 rounded-pill mx-auto mb-6" />

        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-xl font-semibold text-warm-900">Settings</h2>
          <button onClick={onClose} className="text-warm-400 hover:text-warm-700 text-2xl">×</button>
        </div>

        <div className="space-y-6">
          {/* Phone number */}
          <div>
            <label htmlFor="mci-phone" className="block text-sm font-medium text-warm-700 mb-1">
              Mobile phone
            </label>
            <p className="text-xs text-warm-400 mb-3">
              Used for daily plan texts, reminder cues, and summaries. Optional.
            </p>
            <input
              id="mci-phone"
              type="tel"
              value={phone}
              onChange={e => {
                setPhone(e.target.value)
                if (!e.target.value.trim()) setSmsConsent(false)
              }}
              className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900
                         focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100"
              placeholder="(555) 555-0100"
              autoComplete="tel"
              inputMode="tel"
            />
            <label className="mt-3 flex gap-3 rounded-xl border border-cream-300 bg-white/70 p-3 text-xs leading-5 text-warm-600">
              <input
                type="checkbox"
                checked={smsConsent}
                required={Boolean(phone.trim())}
                onChange={e => setSmsConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-warm-500 text-warm-700 focus:ring-warm-500"
              />
              <span>
                Optional SMS opt-in: I agree to receive Context SMS messages. Message frequency varies.
                Message and data rates may apply. Reply HELP for help or STOP to opt out.
              </span>
            </label>
          </div>

          {/* Re-entry reminder gap */}
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-1">
              Text reminder frequency
            </label>
            <p className="text-xs text-warm-400 mb-3">
              If something in today&apos;s plan is still waiting, send a gentle SMS reminder after this long.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {GAP_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setGap(opt.value)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium border-2 transition-all ${
                    gap === opt.value
                      ? 'bg-warm-700 text-cream-100 border-warm-700'
                      : 'bg-cream-100 text-warm-600 border-cream-200 hover:border-warm-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Daily summary time */}
          <div>
            <label className="block text-sm font-medium text-warm-700 mb-1">
              Daily text rhythm
            </label>
            <div className="rounded-xl border border-cream-200 bg-cream-100 px-4 py-3 text-xs leading-5 text-warm-500">
              <p>Morning plan text: 8:00 AM</p>
              <p>Reminder checks: only when something is still waiting</p>
              <p>Final follow-up window: around 8:00 PM</p>
            </div>
          </div>

          <div>
            <label htmlFor="summary-time" className="block text-sm font-medium text-warm-700 mb-1">
              Daily summary time
            </label>
            <p className="text-xs text-warm-400 mb-3">
              When you and your care partner receive the end-of-day SMS summary.
            </p>
            <input
              id="summary-time"
              type="time"
              value={summaryTime}
              onChange={e => setSummaryTime(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-cream-300 bg-cream-50 text-warm-900
                         focus:outline-none focus:border-terracotta-400 focus:ring-2 focus:ring-terracotta-100"
            />
          </div>

          {error && (
            <p className="text-terracotta-500 text-sm bg-terracotta-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-xl bg-warm-700 text-cream-100 font-medium hover:bg-warm-900 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save settings'}
          </button>

          <div className="border-t border-cream-200 pt-4">
            <button
              onClick={onSignOut}
              className="w-full py-3 text-warm-400 text-sm hover:text-terracotta-500 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
