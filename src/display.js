import { eligibleFormula, renderFormula } from './formulas.js'

export const COPY_ATTRIBUTE = 'data-hermes-chinese-latex-copy'
const BLOCK = 'p, h1, h2, h3, h4, h5, h6, td, th, li'
const UNSAFE = 'button, input, textarea, select, iframe, video, audio, canvas, img, script, style, [contenteditable], [role="button"], [data-md-col-handle], [data-slot="code-card"], [data-hermes-chinese-latex-copy]'

function nodePath(root, node) {
  const path = []
  while (node !== root) {
    if (!node?.parentNode) return null
    path.unshift([...node.parentNode.childNodes].indexOf(node))
    node = node.parentNode
  }
  return path
}

function follow(root, path) {
  return path?.reduce((node, index) => node?.childNodes[index], root)
}

function candidateBlock(members) {
  const first = members[0]?.node, last = members.at(-1)?.node
  if (!first || !last) return null
  for (let block = first.parentElement?.closest(BLOCK); block; block = block.parentElement?.closest(BLOCK)) {
    if (block.contains(last) && block.closest('.aui-md')) return block
  }
  return null
}

function safeBlock(block) {
  if (block.closest('[hidden], pre, code, .katex, .katex-error, a, [contenteditable]')) return false
  if (block.matches(UNSAFE) || block.querySelector(UNSAFE)) return false
  // Keep host-managed media and interactive HTML in the original tree.
  return [...block.querySelectorAll('*')].every(element =>
    /^(SPAN|EM|STRONG|DEL|S|B|I|U|A|BR|SUB|SUP|CODE|P)$/.test(element.tagName) ||
    Boolean(element.closest('.katex, .katex-error')))
}

export function planDisplays(model, aligned) {
  const groups = new Map()
  for (let index = 0; index < model.tokens.length; index++) {
    const formula = eligibleFormula(model, model.tokens[index])
    if (!formula) continue
    const members = aligned.tokens[index].members.filter(member => !member.synthetic)
    // Already rendered by the host (or this plugin): do not render twice.
    if (!members.length || members.some(member => member.kind !== 'text' || !member.node)) continue
    const original = candidateBlock(members)
    if (!original || !safeBlock(original)) continue
    const html = renderFormula(formula.body)
    if (!html) continue
    const from = members[0], to = members.at(-1)
    const replacement = {
      fromPath: nodePath(original, from.node), from: from.from,
      toPath: nodePath(original, to.node), to: to.to, html,
      order: formula.start
    }
    if (!replacement.fromPath || !replacement.toPath) continue
    const group = groups.get(original) || { original, replacements: [] }
    group.replacements.push(replacement)
    groups.set(original, group)
  }
  // Overlapping block copies would duplicate content. Keep the smallest block.
  return [...groups.values()].filter(group =>
    ![...groups.keys()].some(other => other !== group.original && group.original.contains(other)))
}

export function selectionTouches(doc, element) {
  const selection = doc.getSelection()
  if (!selection || selection.isCollapsed) return false
  for (let index = 0; index < selection.rangeCount; index++) {
    try { if (selection.getRangeAt(index).intersectsNode(element)) return true } catch { return true }
  }
  return false
}

export function installDisplay(plan) {
  const { original } = plan
  const doc = original.ownerDocument
  if (!original.isConnected || selectionTouches(doc, original)) return null
  const clone = original.cloneNode(true)
  clone.setAttribute(COPY_ATTRIBUTE, '')
  for (const element of [clone, ...clone.querySelectorAll('[id]')]) element.removeAttribute('id')
  // Map links before changing formula descendants. Events are forwarded to the
  // original host node, retaining React's URL handling and modifier semantics.
  const links = new Map([...clone.querySelectorAll('a')].map((link, index) => [link, original.querySelectorAll('a')[index]]))
  for (const replacement of [...plan.replacements].sort((a, b) => b.order - a.order)) {
    const from = follow(clone, replacement.fromPath), to = follow(clone, replacement.toPath)
    if (!from || !to) return null
    const range = doc.createRange()
    range.setStart(from, replacement.from); range.setEnd(to, replacement.to)
    const math = doc.createElement('span')
    math.setAttribute('data-hermes-chinese-latex-math', '')
    math.innerHTML = replacement.html
    range.deleteContents(); range.insertNode(math)
  }
  const forwardLink = event => {
    const link = event.target?.closest?.('a')
    const target = links.get(link)
    if (!target?.isConnected) return
    event.preventDefault(); event.stopPropagation()
    target.dispatchEvent(new doc.defaultView.MouseEvent(event.type, {
      bubbles: true, cancelable: true, button: event.button, buttons: event.buttons,
      ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey
    }))
  }
  clone.addEventListener('click', forwardLink, true)
  clone.addEventListener('auxclick', forwardLink, true)
  const hidden = original.getAttribute('hidden')
  original.before(clone)
  original.setAttribute('hidden', '')
  // Host CSS can override [hidden]. Inline display is needed for table cells.
  const display = original.style.getPropertyValue('display')
  const priority = original.style.getPropertyPriority('display')
  const hadStyle = original.hasAttribute('style')
  original.style.setProperty('display', 'none', 'important')
  const snapshot = original.outerHTML
  let disposed = false
  return {
    original, clone,
    valid() {
      return !disposed && original.isConnected && clone.isConnected &&
        clone.nextSibling === original && original.outerHTML === snapshot
    },
    dispose() {
      if (disposed) return
      disposed = true
      clone.removeEventListener('click', forwardLink, true)
      clone.removeEventListener('auxclick', forwardLink, true)
      clone.remove()
      // Restore only attributes still owned by us; leave host changes intact.
      if (original.getAttribute('hidden') === '') {
        if (hidden === null) original.removeAttribute('hidden')
        else original.setAttribute('hidden', hidden)
      }
      if (original.style.getPropertyValue('display') === 'none' && original.style.getPropertyPriority('display') === 'important') {
        if (display) original.style.setProperty('display', display, priority)
        else original.style.removeProperty('display')
        if (!hadStyle && !original.getAttribute('style')) original.removeAttribute('style')
      }
    }
  }
}
