type MatchableTask = {
  label?: string | null
  note?: string | null
}

const DIRECT_PROMPT_REPLIES = /^(yes|y|yep|yeah|sure|confirm|no|n|nope|cancel|stop|nevermind|never mind|not now|later)$/i

export function normalizedSmsCommandBody(body: string) {
  return body.trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ')
}

export function isNumericSmsSelection(body: string) {
  const normalized = normalizedSmsCommandBody(body)
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

export function isDirectPromptReply(body: string) {
  return DIRECT_PROMPT_REPLIES.test(normalizedSmsCommandBody(body))
}

function hasListLikeTaskText(normalized: string) {
  const commaParts = normalized.split(/[,;\n]+/).map(part => part.trim()).filter(Boolean)
  if (commaParts.length >= 2) return true

  return /^(go to|drive|call|work on|finish|find|respond to|take|pick up|email|text|pay|visit|meet|schedule|remind me)\b/i.test(normalized) ||
    /\b(appointment|meeting|medicine|medication)\s+(at|on|after|before|today|tomorrow)\b/i.test(normalized)
}

export function isClearNewSmsIntent(body: string) {
  const normalized = normalizedSmsCommandBody(body)
  if (!normalized) return false
  if (isDirectPromptReply(normalized)) return false
  if (isNumericSmsSelection(body)) return false

  if (/^(add|plan|done|finished|complete|completed|undo|status|help|delete|remove|move|stop repeating|edit|change|reschedule|skip)\b/i.test(normalized)) {
    return true
  }

  if (/^add\s*:/i.test(body)) return true

  if (/\b(i plan to|i want to|i need to|i will|i'm going to|im going to|remind me to|please add|add this|add that|so add|exactly,?\s+so add)\b/i.test(normalized)) {
    return true
  }

  return hasListLikeTaskText(normalized)
}

export function normalizeTaskTextForSmsMatch(text: string | null | undefined) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|to|my|your|for|with|at|in|on|today|tomorrow|task|tasks|please)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function taskDisplayText(task: MatchableTask) {
  return task.note?.trim() || task.label?.trim() || ''
}

function tokenSet(text: string) {
  return new Set(normalizeTaskTextForSmsMatch(text).split(/\s+/).filter(Boolean))
}

export function findBestSmsTaskMatches<T extends MatchableTask>(target: string, tasks: T[]) {
  const normalizedTarget = normalizeTaskTextForSmsMatch(target)
  if (!normalizedTarget) return []
  const targetTokens = tokenSet(target)
  if (targetTokens.size === 0) return []

  const scored = tasks
    .map(task => {
      const taskText = taskDisplayText(task)
      const normalizedTask = normalizeTaskTextForSmsMatch(taskText)
      const taskTokens = tokenSet(taskText)
      const shared = [...targetTokens].filter(token => taskTokens.has(token)).length
      const coverage = shared / Math.max(1, targetTokens.size)
      const exact = normalizedTask === normalizedTarget
      const contained = normalizedTask.includes(normalizedTarget) || normalizedTarget.includes(normalizedTask)
      const score = exact ? 1 : contained ? 0.9 : coverage
      return { task, score, shared }
    })
    .filter(result => result.score >= 0.6 && result.shared > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return []

  const best = scored[0].score
  return scored.filter(result => result.score >= Math.max(0.6, best - 0.15)).map(result => result.task)
}

function cleanCommandTarget(target: string | undefined) {
  return target
    ?.replace(/^[:\-\s]+/, '')
    .replace(/\b(today|from today|from my plan|from context|in context|please)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null
}

export function extractStopRepeatingTarget(body: string) {
  const normalized = normalizedSmsCommandBody(body)
  const patterns = [
    /^stop repeating\s+(.+)$/i,
    /^cancel repeating\s+(.+)$/i,
    /^stop\s+(.+?)\s+from repeating$/i,
    /^do not repeat\s+(.+)$/i,
    /^don't repeat\s+(.+)$/i,
    /^dont repeat\s+(.+)$/i,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match) return cleanCommandTarget(match[1])
  }
  return null
}

export function isStopRepeatingCommand(body: string) {
  const normalized = normalizedSmsCommandBody(body)
  return /^(stop repeating|cancel repeating|do not repeat|don't repeat|dont repeat)\b/i.test(normalized) ||
    /^stop\s+.+\s+from repeating$/i.test(normalized)
}

export function extractDeleteTarget(body: string) {
  const normalized = normalizedSmsCommandBody(body)
  const match = normalized.match(/^(delete|remove)\s+(.+)$/i)
  return cleanCommandTarget(match?.[2])
}

export function extractDoneTarget(body: string) {
  const normalized = normalizedSmsCommandBody(body)
  const patterns = [
    /^(done|finished|complete|completed)\s+(.+)$/i,
    /^i\s+(finished|completed|did)\s+(.+)$/i,
    /^(.+?)\s+(is\s+)?(done|finished|complete|completed)$/i,
  ]
  for (const pattern of patterns) {
    const match = normalized.match(pattern)
    if (match) return cleanCommandTarget(match[2] ?? match[1])
  }
  return null
}
