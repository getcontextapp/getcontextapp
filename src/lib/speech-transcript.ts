export type SpeechResultSegment = {
  isFinal: boolean
  transcript: string
}

function normalizeSegment(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function removeAdjacentDuplicateSegments(segments: string[]) {
  const result: string[] = []
  for (const segment of segments) {
    const normalized = normalizeSegment(segment)
    const previous = result[result.length - 1]
    // Android Chrome can emit the same completed segment twice. Suppress only
    // multi-word exact repeats; intentional repetitions like “bye bye” remain.
    if (previous && normalized.length > 4 && normalized === normalizeSegment(previous) && normalized.includes(' ')) continue
    result.push(segment)
  }
  return result
}

function collapseSpeechRepeats(value: string) {
  const words = value.split(/(\s+)/)
  const output: string[] = []
  for (let index = 0; index < words.length; index += 1) {
    const token = words[index]
    if (/^\s+$/.test(token) || !token) {
      output.push(token)
      continue
    }
    const previous = output.filter(part => !/^\s+$/.test(part)).at(-1) ?? ''
    if (token.length > 2 && normalizeSegment(token) === normalizeSegment(previous)) continue
    output.push(token)
  }
  return output.join('').replace(/\s+/g, ' ').trim()
}

export function mergeSpeechResults(
  finalSegments: Record<number, string>,
  results: SpeechResultSegment[],
  resultIndex: number,
) {
  const nextFinalSegments = { ...finalSegments }
  const interimSegments: string[] = []

  for (let offset = 0; offset < results.length; offset += 1) {
    const result = results[offset]
    const index = resultIndex + offset
    const transcript = result.transcript.trim()
    if (!transcript) continue
    if (result.isFinal) nextFinalSegments[index] = transcript
    else interimSegments.push(transcript)
  }

  const finalParts = Object.keys(nextFinalSegments)
    .map(Number)
    .sort((left, right) => left - right)
    .map(index => nextFinalSegments[index])
  const deduplicatedFinalParts = removeAdjacentDuplicateSegments(finalParts)
  const interim = interimSegments.join(' ')

  const transcript = [...deduplicatedFinalParts, interim].filter(Boolean).join(' ').trim()
  return {
    finalSegments: nextFinalSegments,
    transcript: collapseSpeechRepeats(transcript),
    duplicateSuppressed: deduplicatedFinalParts.length < finalParts.length,
  }
}
