'use client'

import { useRef, useState } from 'react'

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
type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
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
}: Props) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const baseTextRef = useRef('')
  const finalTranscriptRef = useRef('')
  const shouldKeepListeningRef = useRef(false)

  function stopListening() {
    shouldKeepListeningRef.current = false
    recognitionRef.current?.stop()
    setListening(false)
  }

  function startListening() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      onNotice?.('Voice not available on this browser. Please type instead.')
      window.setTimeout(() => onNotice?.(null), 3500)
      return
    }

    onNotice?.(null)
    const recognition = new Recognition()
    recognitionRef.current = recognition
    baseTextRef.current = value
    finalTranscriptRef.current = ''
    shouldKeepListeningRef.current = true
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = event => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim()
        } else {
          interim = `${interim} ${transcript}`.trim()
        }
      }
      onChange(joinSpeech(baseTextRef.current, `${finalTranscriptRef.current} ${interim}`))
    }

    recognition.onerror = () => {
      if (!shouldKeepListeningRef.current) {
        setListening(false)
        recognitionRef.current = null
      }
    }

    recognition.onend = () => {
      onChange(joinSpeech(baseTextRef.current, finalTranscriptRef.current))
      if (shouldKeepListeningRef.current) {
        window.setTimeout(() => {
          try {
            recognition.start()
            setListening(true)
          } catch {
            setListening(false)
            recognitionRef.current = null
            shouldKeepListeningRef.current = false
          }
        }, 150)
        return
      }
      setListening(false)
      recognitionRef.current = null
    }

    try {
      recognition.start()
      setListening(true)
    } catch {
      setListening(false)
      recognitionRef.current = null
      shouldKeepListeningRef.current = false
    }
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
