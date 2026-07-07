'use client'

import { FormEvent, useState } from 'react'

type Status = { type: 'ok' | 'err'; message: string } | null

export default function PilotForm() {
  const [status, setStatus] = useState<Status>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') || '').trim()
    const email = String(data.get('email') || '').trim()
    const role = String(data.get('role') || '').trim()

    if (!name || !email || !role || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setStatus({ type: 'err', message: 'Please add your name, a valid email, and choose the option that describes you.' })
      return
    }

    setSaving(true)
    setStatus(null)

    try {
      const response = await fetch('/api/pilot-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          role,
          phone: String(data.get('phone') || '').trim(),
          source: 'landing_home',
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Could not save your request right now.')
      form.reset()
      setStatus({ type: 'ok', message: "Thank you. You're on the list. We'll be in touch about the pilot soon." })
    } catch (error) {
      setStatus({
        type: 'err',
        message: error instanceof Error ? error.message : 'Something went wrong. Please email getcontextapp@gmail.com.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="landing-f-grid">
        <div className="landing-field">
          <label htmlFor="fName">Your name</label>
          <input id="fName" name="name" type="text" autoComplete="name" required />
        </div>
        <div className="landing-field">
          <label htmlFor="fEmail">Email address</label>
          <input id="fEmail" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="landing-field">
          <label htmlFor="fPhone">Phone number <span>(optional)</span></label>
          <input id="fPhone" name="phone" type="tel" autoComplete="tel" />
        </div>
        <div className="landing-field">
          <label htmlFor="fRole">I am a...</label>
          <select id="fRole" name="role" required defaultValue="">
            <option value="">Select one</option>
            <option value="person_with_memory_changes">Person with memory changes</option>
            <option value="care_partner">Care partner</option>
            <option value="clinician">Clinician or program staff</option>
          </select>
        </div>
      </div>
      <button className="landing-btn landing-btn-dark landing-submit" type="submit" disabled={saving}>
        {saving ? 'Joining...' : 'Join the pilot'} <span className="landing-arr">→</span>
      </button>
      <p className="landing-f-privacy">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        Your information is private and never shared.
      </p>
      {status && (
        <p className={`landing-form-status ${status.type}`} role="status">
          {status.message}
        </p>
      )}
    </form>
  )
}
