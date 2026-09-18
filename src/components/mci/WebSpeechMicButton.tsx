'use client'

import { useEffect, useRef, useState } from 'react'

type SpeechRecognitionAlternative = { transcript: string }
type SpeechRecognitionResult = {
  isFinal: boolean
  0: SpeechRecognitionAlternative
}
type SpeechRecognitionResultList = {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}
type SpeechRecognitionEvent = {
  resultIndex: number
  results: SpeechRecognitionResultList
}
type SpeechRecognitionErrorEvent = {
  error?: string
}
type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

interface Props {
  value: string
  onChange: (value: string) => void
  onNotice?: (message: string | null) => void
  className?: string
  activeClassName?: string
  ariaLabel?: string
  surface?: 'plan' | 'reflection'
  onStart?: () => void
}

function joinSpeech(base: string, transcript: string) {
  const left = base.trimEnd()
  const right = transcript.trim()
  if (!left) return right
  if (!right) return left
  return `${left} ${right}`
}

export default function WebSpeechMicButton({
  value,
  onChange,
  onNotice,
  className = '',
  activeClassName = '',
  ariaLabel = 'Speak',
  surface = 'plan',
  onStart,
}: Props) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const baseTextRef = useRef('')
  const sessionTranscriptRef = useRef('')
  const latestValueRef = useRef(value)
  const startedAtRef = useRef<number | null>(null)
  const resultEventCountRef = useRef(0)

  function trackVoiceEvent(eventName: string, properties: Record<string, unknown> = {}) {
    const userAgent = window.navigator.userAgent
    const platform = /Android/i.test(userAgent) ? 'android' : /iPhone|iPad|iPod/i.test(userAgent) ? 'ios' : 'other'
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: eventName, properties: { surface, platform, ...properties } }),
    }).catch(() => undefined)
  }

  useEffect(() => {
    latestValueRef.current = value
  }, [value])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  function startRecognition(baseText: string) {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      onNotice?.('Voice not available on this browser. Please type instead.')
      window.setTimeout(() => onNotice?.(null), 3500)
      return
    }

    onNotice?.(null)
    const recognition = new Recognition()
    recognitionRef.current = recognition
    baseTextRef.current = baseText
    sessionTranscriptRef.current = ''
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = event => {
      resultEventCountRef.current += 1
      // Safari can resend earlier result indexes as its interpretation improves.
      // Rebuild the session transcript instead of repeatedly appending them.
      const transcriptParts: string[] = []
      for (let index = 0; index < event.results.length; index++) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''
        if (transcript.trim()) transcriptParts.push(transcript.trim())
      }
      sessionTranscriptRef.current = transcriptParts.join(' ')
      onChange(joinSpeech(baseTextRef.current, sessionTranscriptRef.current))
    }

    recognition.onerror = event => {
      const errorName = event.error ?? ''
      trackVoiceEvent('voice_input_failed', { error: errorName || 'unknown' })
      if (errorName === 'not-allowed' || errorName === 'service-not-allowed') {
        onNotice?.('Voice permission was blocked. Please type instead.')
        window.setTimeout(() => onNotice?.(null), 3500)
        setListening(false)
        recognitionRef.current = null
      }
    }

    recognition.onend = () => {
      const committedText = joinSpeech(baseTextRef.current, sessionTranscriptRef.current)
      onChange(committedText)
      latestValueRef.current = committedText
      setListening(false)
      recognitionRef.current = null
      trackVoiceEvent('voice_input_completed', {
        duration_ms: startedAtRef.current ? Date.now() - startedAtRef.current : null,
        result_events: resultEventCountRef.current,
        captured_characters: sessionTranscriptRef.current.length,
      })
      startedAtRef.current = null
    }

    try {
      recognition.start()
      setListening(true)
      startedAtRef.current = Date.now()
      resultEventCountRef.current = 0
      onStart?.()
      trackVoiceEvent('voice_input_started')
    } catch {
      setListening(false)
      recognitionRef.current = null
    }
  }

  function startListening() {
    startRecognition(latestValueRef.current)
  }

  return (
    <button
      type="button"
      onClick={listening ? stopListening : startListening}
      className={`${className} ${listening ? activeClassName : ''}`}
      aria-label={listening ? 'Stop voice input' : ariaLabel}
      aria-pressed={listening}
      title={listening ? 'Stop voice input' : ariaLabel}
    >
      {listening ? <span className="h-2.5 w-2.5 rounded-full bg-terracotta-600 animate-pulse-soft" aria-hidden="true" /> : '🎙'}
    </button>
  )
}
