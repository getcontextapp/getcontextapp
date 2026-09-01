'use client'
import { useState } from 'react'

interface Props {
  household: { join_code: string; name: string }
  carePartner: { display_name: string } | null
  onClose: () => void
}

export default function HouseholdCode({ household, carePartner, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    await navigator.clipboard.writeText(household.join_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-warm-900/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg mx-auto bg-cream-50 rounded-t-3xl pt-2 pb-10 px-6 shadow-float animate-fade-up">
        <div className="w-10 h-1 bg-warm-300 rounded-pill mx-auto mb-6" />

        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-xl font-semibold text-warm-900">Your household</h2>
          <button onClick={onClose} className="text-warm-400 hover:text-warm-700 text-2xl">×</button>
        </div>

        <p className="text-warm-600 text-sm mb-2">{household.name}</p>
        <p className="mb-4 rounded-xl bg-sage-50 px-4 py-3 text-sm font-medium text-sage-700">
          {carePartner
            ? `Shared with ${carePartner.display_name.split(/\s+/)[0]}.`
            : 'You are currently using Context by yourself.'}
        </p>

        <div className="card p-6 text-center space-y-3 mb-4">
          <p className="text-warm-500 text-sm">{carePartner ? 'Your household code' : 'Invite someone you trust with this code'}</p>
          <div className="text-4xl font-mono font-bold tracking-[0.3em] text-warm-900 select-all">
            {household.join_code}
          </div>
          <button
            onClick={copyCode}
            className="text-sm text-terracotta-500 font-medium underline underline-offset-2 hover:text-terracotta-700 transition-colors"
          >
            {copied ? 'Copied! ✓' : 'Copy code'}
          </button>
        </div>

        <p className="text-warm-400 text-xs text-center">
          They can choose “Someone I support” during signup and enter this code. Your existing plans and settings will stay the same.
        </p>
      </div>
    </div>
  )
}
