function normalizedSmsBody(body: string) {
  return body.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isNumericSelection(body: string) {
  const normalized = normalizedSmsBody(body)
    .replace(/\b(and|plus)\b/g, ',')
    .replace(/[&+/]/g, ',')
    .replace(/^(done|finished|completed|complete|yes|yep|delete|remove|move|undo)\s*:?\s*/, '')
    .trim()

  return normalized === 'all' ||
    normalized === 'both' ||
    normalized === 'everything' ||
    normalized === 'the rest' ||
    /^\d+(?:[\s,.-]+\d+)*$/.test(normalized)
}

export function isSmsActionLikeInput(body: string) {
  const normalized = normalizedSmsBody(body)
  if (!normalized) return true

  if (/^(yes|y|yep|yeah|sure|confirm|no|n|nope|cancel|stop|nevermind|never mind|not now|later)$/i.test(normalized)) {
    return true
  }

  if (isNumericSelection(body)) return true

  if (/^(move|delete|remove|done|finished|complete|completed|undo|status|help|add|plan|stop repeating|edit|change|reschedule|skip)\b/i.test(normalized)) {
    return true
  }

  if (/^add\s*:/i.test(body)) return true

  if (/\b(move|delete|remove|stop repeating|mark done|mark it done|move back|put back|undo|reschedule)\b/i.test(normalized)) {
    return true
  }

  if (/\b(i plan to|i want to|i need to|i will|i'm going to|im going to|remind me to|add this|add that)\b/i.test(normalized)) {
    return true
  }

  return false
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
