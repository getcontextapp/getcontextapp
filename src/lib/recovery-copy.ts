import type { EpisodeState, EpisodeStatus, RecoveryIntent } from './context-rank'

type StatusDistribution = Partial<Record<EpisodeStatus, number>>

type ActivityPhrases = {
  raw: string
  infinitive: string
  gerund: string
  object: string
}

type RecoveryCopyInput = {
  intent: RecoveryIntent | null
  activityLabel: string
  statusDistribution: StatusDistribution
  episodeState: EpisodeState
}

export function buildRecoveryAnswerText({
  intent,
  activityLabel,
  statusDistribution,
  episodeState,
}: RecoveryCopyInput) {
  const phrases = activityPhrases(activityLabel)
  if (!phrases.raw) return "I don't have enough to name it yet."

  const completed = statusDistribution.completed ?? 0
  const planned = statusDistribution.planned ?? 0
  const confirmed = episodeState === 'confirmed'
  const done = completed >= 0.55 || confirmed

  if (intent === 'did_i_finish_this') {
    if (done) return `It looks like you ${markedDonePhrase(phrases)}.`
    return `I am not sure ${finishedObject(phrases)} is finished.`
  }

  if (intent === 'what_should_i_do_next') {
    if (planned >= 0.45 && completed < 0.55) return `Your next likely step is to ${phrases.infinitive}.`
    return `I do not see a clearer next step than ${phrases.gerund}.`
  }

  if (intent === 'where_did_i_leave_off') return `The last clear thing I see is ${phrases.gerund}.`

  if (intent === 'what_changed_today') {
    if (done) return `You ${markedDonePhrase(phrases)} today.`
    return `One thing I found today is ${phrases.object || phrases.gerund}.`
  }

  if (done) return `You may have been ${phrases.gerund}.`
  if (planned >= 0.45) return `You planned to ${phrases.infinitive}, but I am not sure you did it.`
  return `This may be about ${phrases.object || phrases.gerund}.`
}

export function activityPhrases(value: string): ActivityPhrases {
  const raw = value.trim().replace(/[?.!]+$/, '')
  if (!raw) return { raw: '', infinitive: '', gerund: '', object: '' }

  const lower = lowercaseFirst(raw)
  const simple = lower.toLowerCase()

  const simpleMap: Record<string, Omit<ActivityPhrases, 'raw'>> = {
    drive: { infinitive: 'drive', gerund: 'driving', object: 'driving' },
    run: { infinitive: 'run', gerund: 'running', object: 'running' },
    jog: { infinitive: 'jog', gerund: 'jogging', object: 'jogging' },
    dance: { infinitive: 'dance', gerund: 'dancing', object: 'dancing' },
  }

  if (simpleMap[simple]) return { raw, ...simpleMap[simple] }

  const goTo = lower.match(/^(?:go to|going to) (.+)$/i)
  if (goTo) {
    const object = normalizeObject(goTo[1])
    return { raw, infinitive: `go to ${object}`, gerund: `going to ${object}`, object }
  }

  const workOn = lower.match(/^(?:work on|working on) (.+)$/i)
  if (workOn) {
    const object = normalizeObject(workOn[1])
    return { raw, infinitive: `work on ${object}`, gerund: `working on ${object}`, object: `${object} work` }
  }

  const phrasePatterns: Array<[RegExp, string, string]> = [
    [/^(?:do|doing) (.+)$/i, 'do', 'doing'],
    [/^(?:finish|finishing) (.+)$/i, 'finish', 'finishing'],
    [/^(?:find|finding) (.+)$/i, 'find', 'finding'],
    [/^(?:make|making) (.+)$/i, 'make', 'making'],
    [/^(?:take|taking) (.+)$/i, 'take', 'taking'],
    [/^(?:pick up|picking up) (.+)$/i, 'pick up', 'picking up'],
  ]

  for (const [pattern, infinitiveVerb, gerundVerb] of phrasePatterns) {
    const match = lower.match(pattern)
    if (match) {
      const object = normalizeObject(match[1])
      return {
        raw,
        infinitive: `${infinitiveVerb} ${object}`,
        gerund: `${gerundVerb} ${object}`,
        object,
      }
    }
  }

  return { raw, infinitive: lower, gerund: lower, object: lower }
}

function markedDonePhrase(phrases: ActivityPhrases) {
  return `marked ${phrases.object || phrases.gerund} as done`
}

function finishedObject(phrases: ActivityPhrases) {
  return phrases.object || phrases.gerund
}

function normalizeObject(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function lowercaseFirst(value: string) {
  return value[0].toLowerCase() + value.slice(1)
}
