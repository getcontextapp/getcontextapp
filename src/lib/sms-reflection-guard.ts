import { isClearNewSmsIntent, isDirectPromptReply, isNumericSmsSelection, normalizedSmsCommandBody } from './sms-command-intent'

function normalizedSmsBody(body: string) {
  return normalizedSmsCommandBody(body)
}

function isNumericSelection(body: string) {
  return isNumericSmsSelection(body)
}

export function isSmsActionLikeInput(body: string) {
  const normalized = normalizedSmsBody(body)
  if (!normalized) return true

  if (isDirectPromptReply(normalized)) {
    return true
  }

  if (isNumericSelection(body)) return true

  if (/^(move|delete|remove|done|finished|complete|completed|undo|status|help|add|plan|stop repeating|edit|change|reschedule|skip|cancel repeating|do not repeat|don't repeat|dont repeat)\b/i.test(normalized)) {
    return true
  }

  if (/^add\s*:/i.test(body)) return true

  if (/\b(move|delete|remove|stop repeating|from repeating|cancel repeating|do not repeat|don't repeat|dont repeat|mark done|mark it done|move back|put back|undo|reschedule)\b/i.test(normalized)) {
    return true
  }

  if (/\b(i plan to|i want to|i need to|i will|i'm going to|im going to|remind me to|please add|add this|add that|so add|exactly,?\s+so add)\b/i.test(normalized)) {
    return true
  }

  return isClearNewSmsIntent(body)
}

export function shouldSaveSmsAsReflectionReply(body: string) {
  return !isSmsActionLikeInput(body)
}

export function isReflectionCommandNoise(input: string | null | undefined) {
  if (!input?.trim()) return false

  const lines = input
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return false
  return lines.every(line => isSmsActionLikeInput(line))
}
