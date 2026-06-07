import Anthropic from '@anthropic-ai/sdk'
import type { ActivityCategory, ExpectedPeriod, ParsedSmsPlanReply } from '@/types'
import { APP_URL } from '@/lib/sms'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-3-5-haiku-latest'

interface ReentryCardInput {
  displayName: string
  recentActivities: Array<{ label: string; category: string; note?: string | null; occurred_at: string }>
  triggerActivity: { label: string; category: string; note?: string | null }
  gapMinutes: number
}

interface GeneratedCard {
  title: string
  body: string
}

export interface PendingSmsItem {
  label: string
  category: string
  note?: string | null
  expected_period?: string | null
}

export interface ParsedPendingSmsReply {
  intent: 'pending_action' | 'unclear'
  action: 'yes' | 'not_now' | 'skip' | null
  selected_numbers: number[] | 'all'
  reply: string
}

export interface SmsInterpreterContext {
  pendingItems?: PendingSmsItem[]
  todaysItems?: PendingSmsItem[]
  recentMessages?: Array<{
    direction: 'inbound' | 'outbound'
    body: string
  }>
}

const VALID_CATEGORIES: ActivityCategory[] = ['morning', 'meal', 'movement', 'social', 'rest', 'medication', 'custom']
const VALID_PERIODS: ExpectedPeriod[] = ['morning', 'afternoon', 'evening', 'anytime']

function cleanJson(raw: string) {
  return raw.replace(/```json|```/g, '').trim()
}

function safeCategory(value: unknown): ActivityCategory {
  return VALID_CATEGORIES.includes(value as ActivityCategory) ? value as ActivityCategory : 'custom'
}

function safePeriod(value: unknown): ExpectedPeriod {
  return VALID_PERIODS.includes(value as ExpectedPeriod) ? value as ExpectedPeriod : 'anytime'
}

function inferPeriod(text: string): ExpectedPeriod {
  const lower = text.toLowerCase()
  if (/\b(morning|breakfast|wake|shower|dress|coffee|tea|am|a\.m\.)\b/.test(lower)) return 'morning'
  if (/\b(afternoon|lunch|after lunch|noon|midday)\b/.test(lower)) return 'afternoon'
  if (/\b(evening|dinner|tonight|night|before bed|pm|p\.m\.)\b/.test(lower)) return 'evening'
  if (/\blater\b/.test(lower)) return 'afternoon'
  return 'anytime'
}

function fallbackParseSmsPlanReply(message: string): ParsedSmsPlanReply {
  const lower = message.toLowerCase()
  const items: ParsedSmsPlanReply['items'] = []
  const completedCue = /\b(called|went|visited|ate|had|took|walked|stretched|watched|rested|washed|dressed|finished|completed|did|made|cooked|cleaned|paid|checked|worked|played)\b/.test(lower)

  const add = (category: ActivityCategory, note: string, confidence: 'high' | 'medium' = 'medium') => {
    if (!items.some(item => item.category === category && item.note.toLowerCase() === note.toLowerCase())) {
      items.push({ category, note, expected_period: inferPeriod(`${message} ${note}`), confidence })
    }
  }

  if (/\b(yes|done|did it|finished|completed|took it|already)\b/.test(lower) && lower.length < 80) {
    return {
      intent: 'confirmation',
      items: [],
      confirmation: 'yes',
      reply: 'Thank you. I marked that in Context.',
    }
  }

  if (/\b(not yet|later|not now)\b/.test(lower) && lower.length < 80) {
    return {
      intent: 'confirmation',
      items: [],
      confirmation: 'not_now',
      reply: 'No problem. I will leave it in your plan for later.',
    }
  }

  if (/\b(skip|cancel|forget it|no)\b/.test(lower) && lower.length < 80) {
    return {
      intent: 'confirmation',
      items: [],
      confirmation: 'skip',
      reply: 'Okay. I will leave that aside for now.',
    }
  }

  const planningListCue = /\b(my plans?|my to-?do list|add these|i need to|i want to|i plan to)\b/.test(lower)
  if (planningListCue) {
    const listText = message
      .replace(/^.*?\b(?:my plans?|my to-?do list|add these(?: to my plans?)?|i need to|i want to|i plan to)\b\s*:?\s*/i, '')
    const listItems = listText
      .split(/[,;\n]+/)
      .map(item => normalizePlannedNote(item).replace(/[.]+$/, '').trim())
      .filter(item => item.length > 1)

    for (const note of listItems.slice(0, 12)) {
      add('custom', note, 'medium')
    }
  }

  if (/\b(pill|pills|medicine|medication|meds|vitamin|supplement)\b/.test(lower)) add('medication', completedCue ? message : 'Take medication', 'high')
  if (/\b(breakfast|lunch|dinner|eat|meal|snack|drink|water|tea|coffee)\b/.test(lower)) add('meal', completedCue ? message : 'Have a meal or drink', 'medium')
  if (/\b(walk|exercise|stretch|gym|garden|yard|outside)\b/.test(lower)) add('movement', completedCue ? message : 'Move around', 'medium')
  if (/\b(call|called|phone|daughter|son|wife|husband|friend|family|neighbor|visit|visited|text|club|church|group|meeting|community)\b/.test(lower)) add('social', completedCue ? message : normalizePlannedNote(message), 'medium')
  if (/\b(nap|rest|sleep|relax|tv|read)\b/.test(lower)) add('rest', 'Rest for a while', 'medium')
  if (/\b(shower|wash|dress|dressed|brush|morning)\b/.test(lower)) add('morning', 'Morning routine', 'medium')
  if (/\b(doctor|appointment|errand|store|shop|bank|bill|clean|laundry|cook|library|class|hobby|game|cards|bingo)\b/.test(lower)) add('custom', completedCue ? message : normalizePlannedNote(message), 'medium')

  if (items.length === 0) {
    return {
      intent: 'unclear',
      items: [],
      confirmation: null,
      reply: `I could not turn that into a clear Context plan yet. You can open Context to add it directly: ${APP_URL}/mci-user`,
    }
  }

  return {
    intent: completedCue ? 'completed' : 'plan',
    items: items.slice(0, 12),
    confirmation: null,
    reply: completedCue ? 'I marked this as done in Context.' : 'I added this to your Context plan.',
  }
}

function normalizePlannedNote(note: string) {
  return note
    .trim()
    .replace(/^i\s+(want|need|plan|hope)\s+to\b/i, '')
    .replace(/^i\s+will\b/i, '')
    .replace(/^i'?m\s+going\s+to\b/i, 'Go to')
    .replace(/^took\b/i, 'Take')
    .replace(/^called\b/i, 'Call')
    .replace(/^walked\b/i, 'Walk')
    .replace(/^went for\b/i, 'Go for')
    .replace(/^ate\b/i, 'Eat')
    .replace(/^had\b/i, 'Have')
    .replace(/^washed\b/i, 'Wash')
    .replace(/^got dressed\b/i, 'Get dressed')
    .replace(/^stretched\b/i, 'Stretch')
    .replace(/^rested\b/i, 'Rest')
    .replace(/^watched\b/i, 'Watch')
    .replace(/^checked\b/i, 'Check')
    .replace(/^worked\b/i, 'Work')
    .slice(0, 160)
}

function fallbackParsePendingSmsReply(message: string, pendingItems: PendingSmsItem[]): ParsedPendingSmsReply {
  const lower = message.toLowerCase()
  const hasDoneCue = /\b(done|did|finished|completed|complete|yes|yep|already|called|went|visited|ate|had|took|walked|stretched|watched|rested|washed|dressed)\b/.test(lower)
  const hasLaterCue = /\b(not yet|later|not now|leave it|wait)\b/.test(lower)
  const hasSkipCue = /\b(skip|cancel|set aside|forget it|no)\b/.test(lower)
  const action = hasSkipCue ? 'skip' : hasLaterCue ? 'not_now' : hasDoneCue ? 'yes' : null

  if (!action) {
    return {
      intent: 'unclear',
      action: null,
      selected_numbers: [],
      reply: 'I was not sure which Context item you meant.',
    }
  }

  if (/\b(all|everything|both|the rest)\b/.test(lower)) {
    return {
      intent: 'pending_action',
      action,
      selected_numbers: 'all',
      reply: 'I matched that to the waiting items.',
    }
  }

  const selected = pendingItems
    .map((item, index) => {
      const label = `${item.note ?? ''} ${item.label}`.toLowerCase()
      const words = label.match(/[a-z0-9]+/g)?.filter(word => word.length > 2) ?? []
      const matched = words.some(word => lower.includes(word))
      return matched ? index + 1 : null
    })
    .filter((value): value is number => Boolean(value))

  if (selected.length === 0 && pendingItems.length === 1) {
    selected.push(1)
  }

  return {
    intent: selected.length > 0 ? 'pending_action' : 'unclear',
    action,
    selected_numbers: selected,
    reply: selected.length > 0 ? 'I matched that to your Context plan.' : 'I was not sure which Context item you meant.',
  }
}

export async function parsePendingSmsReply(
  message: string,
  pendingItems: PendingSmsItem[],
  displayName: string,
  timeZone?: string | null,
): Promise<ParsedPendingSmsReply> {
  const pendingList = pendingItems
    .slice(0, 6)
    .map((item, index) => {
      const label = item.note?.trim() || item.label
      return `${index + 1}. ${label} (${item.category}, ${item.expected_period ?? 'anytime'})`
    })
    .join('\n')

  const prompt = `You are the Context SMS interpreter for an older adult with MCI.

The user is replying by SMS about today's waiting Context plan items. Interpret whether they are confirming items as done, leaving items for later, or skipping items.

User name: ${displayName}
User timezone: ${timeZone ?? 'America/New_York'}

Waiting items:
${pendingList}

SMS text:
"${message}"

Rules:
- Return JSON only. No markdown.
- Match the user's words to one or more waiting items.
- The user may write messy text, omit punctuation, or mention several things in one message.
- If the user says they finished, did, completed, already did, called, went, visited, ate, had, took, walked, watched, or yes for matched items, action is "yes".
- If the user says not yet, later, or not now for matched items, action is "not_now".
- If the user says skip, cancel, no, or forget it for matched items, action is "skip".
- If the user says all, both, everything, or the rest with a clear action, selected_numbers is "all".
- If the user only says "done" and more than one item is waiting, return intent "unclear" so Context can ask which one.
- If the user mentions a new activity that is not in the waiting list, return intent "unclear".
- Only choose numbers from the waiting list.

Return exactly this shape:
{
  "intent": "pending_action" | "unclear",
  "action": "yes" | "not_now" | "skip" | null,
  "selected_numbers": [1, 2] | "all",
  "reply": "short warm SMS reply"
}`

  try {
    const result = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = result.content[0].type === 'text' ? result.content[0].text : ''
    const parsed = JSON.parse(cleanJson(raw))
    const intent = parsed.intent === 'pending_action' ? 'pending_action' : 'unclear'
    const action = ['yes', 'not_now', 'skip'].includes(parsed.action) ? parsed.action : null
    const selectedNumbers: number[] | 'all' = parsed.selected_numbers === 'all'
      ? 'all'
      : Array.isArray(parsed.selected_numbers)
        ? Array.from(new Set(parsed.selected_numbers
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0 && value <= pendingItems.length)))
        : []

    if (intent !== 'pending_action' || !action || (selectedNumbers !== 'all' && selectedNumbers.length === 0)) {
      return {
        intent: 'unclear',
        action: null,
        selected_numbers: [],
        reply: String(parsed.reply ?? 'I was not sure which Context item you meant.').slice(0, 240),
      }
    }

    return {
      intent,
      action,
      selected_numbers: selectedNumbers,
      reply: String(parsed.reply ?? 'I matched that to your Context plan.').slice(0, 240),
    }
  } catch (error) {
    console.error('[Anthropic] Pending SMS parse failed:', error)
    return fallbackParsePendingSmsReply(message, pendingItems)
  }
}

export async function parseSmsPlanReply(
  message: string,
  displayName: string,
  timeZone?: string | null,
  context: SmsInterpreterContext = {},
): Promise<ParsedSmsPlanReply> {
  const pendingItems = (context.pendingItems ?? []).slice(0, 10)
  const todaysItems = (context.todaysItems ?? []).slice(0, 12)
  const recentMessages = (context.recentMessages ?? []).slice(-8)
  const pendingList = pendingItems.length > 0
    ? pendingItems.map((item, index) => `${index + 1}. ${item.note?.trim() || item.label}`).join('\n')
    : 'None'
  const todayList = todaysItems.length > 0
    ? todaysItems.map((item, index) => `${index + 1}. ${item.note?.trim() || item.label}`).join('\n')
    : 'None'
  const conversation = recentMessages.length > 0
    ? recentMessages.map(message => `${message.direction === 'inbound' ? 'User' : 'Context'}: ${message.body}`).join('\n')
    : 'No recent messages'

  const prompt = `You are the primary SMS interpreter for Context, an app for older adults with MCI.

Understand ordinary, natural conversation without requiring special commands. The user may write messy text, omit punctuation, use tense imperfectly, provide a long list, ask a question, or refer to earlier messages.

User name: ${displayName}
User timezone: ${timeZone ?? 'America/New_York'}
Today's waiting items:
${pendingList}

All of today's plan items:
${todayList}

Recent conversation:
${conversation}

SMS text:
"${message}"

Allowed categories:
- morning
- meal
- movement
- social
- rest
- medication
- custom

Allowed expected_period values:
- morning
- afternoon
- evening
- anytime

Rules:
- Return JSON only. No markdown.
- Do not invent tasks that are not implied by the message.
- Prefer the meaning of the complete sentence over isolated keywords. For example, "finish my paper" is a future task, while "finished my paper" reports completion.
- A list introduced by phrases such as "my plans", "my to-do list", "add these", "I need to", or a reply to Context's morning planning question is intent "plan".
- If a message contains several comma-separated or sentence-separated activities, return each distinct activity. Support up to 12.
- Use "custom" for appointments, errands, household tasks, hobbies, finance, community activities, clubs, church, library, games, or anything that does not fit.
- Use "social" for calls, visits, family, friends, neighbors, clubs, groups, church, or community gatherings when the social connection is the main point.
- If the message is mainly "yes", "done", "I did it", or "already did it", set intent to "confirmation" and confirmation to "yes".
- If the message is "not yet", "later", or similar, set intent to "confirmation" and confirmation to "not_now".
- If the message is "skip", "no", "cancel", or similar, set intent to "confirmation" and confirmation to "skip".
- If the user asks what is pending, waiting, left, remaining, or on today's plan, set intent to "pending_status".
- If the user says a waiting item is done, not done yet, should be left for later, or skipped, set intent to "pending_action", set confirmation, and select the matching waiting item numbers. Use "all" when clearly requested.
- If the user asks to undo, correct a mistake, or says something was not done, set intent to "undo_request".
- If the user asks to delete or remove a task, set intent to "delete_request". Do not perform deletion directly; Context will ask for confirmation.
- If the message reports a specific completed activity in past tense, set intent to "completed" and return that completed activity in items.
- Examples of completed activity language: "Called my daughter", "I walked outside", "I had lunch", "Went to club", "Took my pills".
- If the message expresses a future intention, set intent to "plan".
- Examples of plan language: "I want to go to club", "I need to call my daughter", "I will have lunch", "Plan to walk".
- If the message is too vague, set intent to "unclear" and return an empty items array.
- For planned items, write notes as future/neutral action phrases, not past tense.
- For completed items, keep notes as natural completed phrases.
- Good planned notes: "Take morning pills", "Call daughter", "Walk outside", "Eat lunch", "Go to eye appointment".
- Bad planned notes: "Took pills", "Called daughter", "Walked outside", "Ate lunch".
- Keep each note short and natural, using the user's words when possible but converting to plan language.
- If the user mentions tomorrow or another future day, explain briefly that Context currently saves SMS plans for today and return "unclear" unless the message also includes tasks for today.
- Use confidence "high", "medium", or "low".

Return exactly this shape:
{
  "intent": "plan" | "completed" | "confirmation" | "pending_status" | "pending_action" | "undo_request" | "delete_request" | "unclear",
  "items": [
    { "category": "meal", "note": "Lunch", "expected_period": "afternoon", "confidence": "high" }
  ],
  "confirmation": "yes" | "not_now" | "skip" | null,
  "selected_numbers": [1, 2] | "all",
  "reply": "short warm SMS reply"
}`

  try {
    const result = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = result.content[0].type === 'text' ? result.content[0].text : ''
    const parsed = JSON.parse(cleanJson(raw))

    const validIntents = [
      'plan',
      'completed',
      'confirmation',
      'pending_status',
      'pending_action',
      'undo_request',
      'delete_request',
      'unclear',
    ]
    const intent = validIntents.includes(parsed.intent) ? parsed.intent : 'unclear'
    const confirmation = ['yes', 'not_now', 'skip'].includes(parsed.confirmation) ? parsed.confirmation : null
    const selectedNumbers: number[] | 'all' = parsed.selected_numbers === 'all'
      ? 'all'
      : Array.isArray(parsed.selected_numbers)
        ? Array.from(new Set(parsed.selected_numbers
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0 && value <= pendingItems.length)))
        : []
    const items = Array.isArray(parsed.items)
      ? parsed.items
        .slice(0, 12)
        .map((item: any) => ({
          category: safeCategory(item.category),
          note: intent === 'completed'
            ? String(item.note ?? '').trim().slice(0, 160)
            : normalizePlannedNote(String(item.note ?? '')),
          expected_period: safePeriod(item.expected_period),
          confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'medium',
        }))
        .filter((item: any) => item.note && item.confidence !== 'low')
      : []

    return {
      intent,
      items,
      confirmation,
      selected_numbers: selectedNumbers,
      reply: String(parsed.reply ?? 'I saved that in Context.').slice(0, 240),
    }
  } catch (error) {
    console.error('[Anthropic] SMS parse failed:', error)
    return fallbackParseSmsPlanReply(message)
  }
}

export async function generateReentryCard(input: ReentryCardInput): Promise<GeneratedCard> {
  const { displayName, recentActivities, triggerActivity, gapMinutes } = input

  const activityList = recentActivities
    .slice(0, 6)
    .map((a, i) => {
      const t = new Date(a.occurred_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      const detail = a.note?.trim() || a.label
      return `${i + 1}. ${detail} (${a.category}) at ${t}`
    })
    .join('\n')

  const hours = Math.round(gapMinutes / 60 * 10) / 10
  const gapText = hours >= 1 ? `about ${hours} hour${hours !== 1 ? 's' : ''}` : `about ${gapMinutes} minutes`

  const prompt = `You are writing a warm, gentle re-entry card for ${displayName}, an older adult returning to the Context app after being away for ${gapText}.

Their recent activities today:
${activityList}

The activity that just triggered this reminder: "${triggerActivity.label}"

Write a brief, grounding re-entry card to help orient them back to their day. The card should:
- Open with a gentle, friendly greeting (do not use "Hi" or "Hello" — be creative but warm)
- Mention 2–3 of the most recent activities in natural language, like recounting a story
- End with one short, encouraging sentence about continuing their day
- Avoid medical or clinical language
- Be written in second person ("you")
- Total length: 3–5 sentences

Respond ONLY with a JSON object with keys "title" (short, 4–6 words) and "body" (the card text). No markdown, no explanation.`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  try {
    const parsed = JSON.parse(cleanJson(raw))
    return { title: parsed.title ?? 'Welcome back', body: parsed.body ?? raw }
  } catch {
    return { title: 'Welcome back', body: raw }
  }
}

export async function generateOpenContextCard(
  displayName: string,
  recentActivities: Array<{ label: string; category: string; note?: string | null; occurred_at: string }>,
  timeZone?: string | null,
): Promise<GeneratedCard> {
  const now = new Date()
  const currentTime = now.toLocaleTimeString('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const hour = Number(now.toLocaleString('en-US', {
    timeZone: timeZone || undefined,
    hour: 'numeric',
    hour12: false,
  }))
  const dayPart =
    hour < 5 ? 'late night' :
    hour < 12 ? 'morning' :
    hour < 17 ? 'afternoon' :
    hour < 21 ? 'evening' :
    'night'

  const activityList = recentActivities
    .slice(0, 8)
    .map(a => {
      const t = new Date(a.occurred_at).toLocaleTimeString('en-US', {
        timeZone: timeZone || undefined,
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
      const detail = a.note?.trim() || a.label
      return `• ${detail} (${a.category}) at ${t}`
    })
    .join('\n')

  const prompt = `You are writing a gentle orientation card for ${displayName}, an older adult with memory changes who is using Context to reconnect with their day.

Current local time: ${currentTime}
Current part of day: ${dayPart}

Their activities so far today:
${activityList}

The card appears at the top of their home screen. It should help them feel oriented and settled, not evaluated or pushed.

Write 2–3 short, warm sentences. The card should:
- Start with a natural orienting sentence that fits the current time of day
- Do not say "full day" unless it is late afternoon or evening and there are several activities
- Mention the activity details in plain, everyday language
- Prefer details like "Resting" or "Phone call"; do not say "spent time with Morning", "spent time with Meal", or treat category labels as people/things
- Avoid productivity language like "keep building your day", "stay on track", "progress", or "goals"
- Avoid clinical language and avoid sounding like a performance report
- End with a calm grounding sentence, such as "This is a good place to return to your day" or "You can take the next step from here"
- Use second person ("you")
- Keep the tone gentle, familiar, and reassuring

Respond ONLY with JSON: {"title": "4–6 word title", "body": "the summary text"}`

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  try {
    const parsed = JSON.parse(cleanJson(raw))
    return { title: parsed.title ?? "Your day so far", body: parsed.body ?? raw }
  } catch {
    return { title: "Your day so far", body: raw }
  }
}
