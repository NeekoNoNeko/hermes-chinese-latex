import katex from 'katex'

// Match Chinese Han text, not CJK punctuation alone. The host's broader prose
// guard is left intact for variables, prices and bare dollar identifiers.
const HAN = /\p{Script=Han}/u
const TEXT_COMMAND = /^\\(text|textbf|textit|textrm|textsf|texttt|textnormal|mbox)(?![A-Za-z])\s*\{/u

export function hasChineseTextCommand(body) {
  let braces = 0
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\') {
      const command = body.slice(i).match(TEXT_COMMAND)
      if (!command) { i++; continue }
      const start = i + command[0].length
      let depth = 1, end = start
      for (; end < body.length; end++) {
        if (body[end] === '\\') { end++; continue }
        if (body[end] === '{') depth++
        if (body[end] === '}' && --depth === 0) break
      }
      if (depth !== 0) return false
      if (HAN.test(body.slice(start, end))) return true
      i = start - 2 // Still inspect nested text commands with Chinese arguments.
      continue
    }
    if (body[i] === '{') braces++
    if (body[i] === '}' && --braces < 0) return false
  }
  return false
}

export function eligibleFormula(model, token) {
  const unit = token.members.find(member => member.kind === 'math')
  if (!unit) return null
  const raw = model.source.slice(unit.start, unit.end)
  if (!raw.startsWith('$') || raw.startsWith('$$') || !raw.endsWith('$') || /[\r\n]/.test(raw)) return null
  const body = raw.slice(1, -1)
  if (!hasChineseTextCommand(body)) return null
  return { ...unit, body, raw }
}

export function renderFormula(body) {
  if (body.length > 16_000) return null
  try {
    return katex.renderToString(body, {
      displayMode: false, output: 'htmlAndMathml', throwOnError: true,
      strict: 'ignore', trust: false, maxExpand: 1000, maxSize: 20
    })
  } catch { return null }
}
