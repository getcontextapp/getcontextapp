export function isRecallRequest(message: string) {
  const normalized = message.trim().toLowerCase().replace(/[?.!]+$/g, '').replace(/\s+/g, ' ')
  return /^(?:i\s+don'?t\s+know|i\s+do\s+not\s+know|i\s+forgot|i\s+forget|i'?m\s+confused|im\s+confused|what\s+was\s+i\s+doing|what\s+am\s+i\s+doing|where\s+was\s+i|what\s+was\s+i\s+trying\s+to\s+do|remind\s+me\s+what\s+i\s+was\s+doing)$/.test(normalized)
}
