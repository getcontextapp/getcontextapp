'use client'

import { useEffect, useState } from 'react'

type Props = { profileId: string; onClose?: () => void; resetToken?: number }

const STEPS = [
  { title: 'Tell Context your plans', body: 'Type or speak what you want Context to remember.', target: 'capture-entry' },
  { title: 'See your day', body: 'Your Context tasks and calendar appointments appear together.', target: 'todays-plan' },
  { title: 'Mark it done or move it', body: 'Use Done when you finish, or Move when plans change.', target: 'todays-plan' },
  { title: 'Need help remembering?', body: 'Ask Context what you were doing or what comes next.', target: 'recovery-entry' },
  { title: 'You can also reply by SMS', body: 'You can send plans and simple replies by text message.', target: null },
]

export default function FeatureDiscoveryCard({ profileId, onClose, resetToken = 0 }: Props) {
  const storageKey = `context-feature-discovery:${profileId}`
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (resetToken > 0) {
      window.localStorage.removeItem(storageKey)
      setStep(0)
      setVisible(true)
      return
    }
    setVisible(window.localStorage.getItem(storageKey) !== 'done' && window.localStorage.getItem(storageKey) !== 'skipped')
  }, [storageKey, resetToken])

  function finish(value: 'done' | 'skipped') {
    window.localStorage.setItem(storageKey, value)
    setVisible(false)
    onClose?.()
  }

  function next() {
    if (step === STEPS.length - 1) finish('done')
    else setStep(current => current + 1)
  }

  function tryIt() {
    const target = STEPS[step].target
    if (target) document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    next()
  }

  if (!visible) return null
  const current = STEPS[step]
  return (
    <section className="rounded-[20px] border-2 border-sage-200 bg-sage-50 p-4 shadow-card" aria-label="Getting started with Context">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-wide text-sage-700">Getting started · {step + 1} of {STEPS.length}</p><h2 className="mt-1 font-serif text-xl font-semibold text-warm-900">{current.title}</h2></div>
        <button type="button" onClick={() => finish('skipped')} className="min-h-10 px-2 text-sm font-semibold text-warm-500 underline underline-offset-4">Skip</button>
      </div>
      <p className="mt-2 text-base leading-6 text-warm-700">{current.body}</p>
      <div className="mt-4 flex gap-2"><button type="button" onClick={tryIt} className="min-h-11 flex-1 rounded-xl bg-sage-700 px-4 text-sm font-semibold text-white active:scale-[0.98] transition-transform">{current.target ? 'Try it' : 'Next'}</button><button type="button" onClick={next} className="min-h-11 rounded-xl border border-sage-300 bg-white px-4 text-sm font-semibold text-sage-800">{step === STEPS.length - 1 ? 'Finish' : 'Next'}</button></div>
    </section>
  )
}
