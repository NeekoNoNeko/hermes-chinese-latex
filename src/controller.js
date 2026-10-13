import { captureScope, sameScope, scopeOwnsSurface, createHistoryCache } from './vendor/history.js'
import { SELECTORS, projectMessage, projectMessageParts, alignProjection, matchHistory } from './vendor/dom-adapter.js'
import { COPY_ATTRIBUTE, planDisplays, installDisplay } from './display.js'

export function startController(host, ctx, { doc = document, win = window, readPersisted, delay = 80 } = {}) {
  const cache = createHistoryCache(host, {
    readPersisted: readPersisted ?? (typeof win.hermesDesktop?.api === 'function' ? request => win.hermesDesktop.api(request) : undefined)
  })
  let disposed = false, enabled = ctx.storage?.get('enabled', true) !== false
  let scope = captureScope(host), revision = 0, cancelTimer = null, warned = false
  let running = false, rerun = false
  const displays = new Set(), unsubscribers = []
  const observe = () => {
    if (!disposed) observer.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['data-message-streaming', 'data-session-switching', 'data-composer-target', 'hidden', 'class', 'style', 'href', 'id'] })
  }
  function mutate(fn) {
    observer.disconnect()
    try { return fn() } finally { observe() }
  }
  function restore(predicate = () => true) {
    mutate(() => {
      for (const display of displays) if (predicate(display)) { display.dispose(); displays.delete(display) }
    })
  }
  function streaming(display) {
    const message = display.original.closest(SELECTORS.message)
    return Boolean(message?.matches('[data-message-streaming="true"]') || message?.querySelector('[data-message-streaming="true"]'))
  }
  const observer = new win.MutationObserver(records => {
    if (disposed || !enabled) return
    // Revoke copies immediately when React updates/replaces their original.
    restore(display => !display.valid() || streaming(display))
    const relevant = records.some(record => {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement
      return element?.matches?.(SELECTORS.surface) || element?.closest?.(SELECTORS.message) || [...record.addedNodes].some(node =>
        node.nodeType === 1 && (node.matches(`${SELECTORS.surface}, ${SELECTORS.message}`) || node.querySelector(`${SELECTORS.surface}, ${SELECTORS.message}`)))
    })
    if (relevant) schedule()
  })
  function schedule() {
    if (disposed || !enabled) return
    cancelTimer?.()
    cancelTimer = ctx.setTimeout(() => { cancelTimer = null; void scan() }, delay)
  }
  function warn(message) {
    if (warned || disposed) return
    warned = true
    host.notify({ kind: 'info', message })
  }
  function refreshScope() {
    const next = captureScope(host)
    if (!sameScope(scope, next)) {
      revision++; scope = next; cache.clear(); warned = false; restore()
    }
    schedule()
  }
  async function scan() {
    if (disposed || !enabled) return
    if (running) { rerun = true; return }
    running = true
    try {
      const target = captureScope(host), generation = revision
      if (!target || !sameScope(scope, target)) { refreshScope(); return }
      const surfaces = [...doc.querySelectorAll(SELECTORS.surface)].filter(surface =>
        !surface.hasAttribute('data-session-switching') && scopeOwnsSurface(host, target, surface))
      if (!surfaces.length) return
      // No reads while only an actively streaming message is visible.
      if (!surfaces.some(surface => [...surface.querySelectorAll(SELECTORS.message)].some(root =>
        root.getAttribute('data-role') === 'assistant' && !root.querySelector('[data-message-streaming="true"]') &&
        !root.matches('[data-message-streaming="true"]')))) return
      let rows
      try { rows = await cache.load(target) } catch {
        warn('中文公式：消息原文暂不可用，已保留原显示；可在命令面板重新扫描。'); return
      }
      if (!rows || disposed || !enabled || generation !== revision || !sameScope(target, captureScope(host))) return
      restore(display => !display.valid() || streaming(display))
      for (const surface of surfaces) {
        if (!surface.isConnected || !scopeOwnsSurface(host, target, surface) || surface.hasAttribute('data-session-switching')) continue
        const projections = []
        for (const root of surface.querySelectorAll(SELECTORS.message)) {
          // Skip a complete root until all its live parts have settled.
          if (root.matches('[data-message-streaming="true"]') || root.querySelector('[data-message-streaming="true"]')) continue
          try {
            const whole = projectMessage(root)
            if (rows.some(row => alignProjection(whole, row.model))) projections.push(whole)
            else {
              const parts = projectMessageParts(root, whole).filter(part => rows.some(row => alignProjection(part, row.model)))
              projections.push(...parts)
              if (!parts.length && /\\(?:text|mbox)/.test(root.textContent) && !root.querySelector('pre'))
                warn('中文公式：消息原文与当前显示无法可靠匹配，已保留原显示。')
            }
          } catch {
            if (root.querySelector('.aui-md') && /\\(?:text|mbox)/.test(root.textContent))
              warn('中文公式：当前聊天结构无法可靠匹配，已保留原显示。')
          }
        }
        const matched = matchHistory(projections, rows)
        mutate(() => {
          projections.forEach((projection, index) => {
            const model = matched[index]?.model
            if (!model || model.role !== 'assistant') return
            const aligned = alignProjection(projection, model)
            if (!aligned) return
            for (const plan of planDisplays(model, aligned)) {
              if (plan.original.closest(`[${COPY_ATTRIBUTE}]`)) continue
              const display = installDisplay(plan)
              if (display) displays.add(display)
            }
          })
        })
      }
    } catch {
      warn('中文公式：当前显示结构不兼容，已保留原显示。')
    } finally {
      running = false
      if (rerun) { rerun = false; schedule() }
    }
  }
  for (const name of ['focusedSessionId', 'focusedStoredSessionId', 'focusedSessionOwner', 'gateway']) {
    const atom = host.state[name], subscribe = atom?.listen || atom?.subscribe
    if (subscribe) unsubscribers.push(subscribe.call(atom, refreshScope))
  }
  for (const type of ['message.start', 'message.delta', 'message.interim', 'message.complete', 'session.resumed', 'session.reset', 'session.undo', 'session.compacted']) {
    ctx.onEvent(type, event => {
      if (disposed || !enabled) return
      const target = captureScope(host)
      const eventId = event.session_id ?? event.payload?.session_id
      if (eventId && target && eventId !== target.runtimeId && eventId !== target.storedId) return
      revision++; cache.invalidate(target)
      // Edits, undo, compaction and resumes may reuse an unchanged DOM body.
      if (type.startsWith('session.')) restore()
      if (!['message.start', 'message.delta'].includes(type)) schedule()
    })
  }
  // Do not replace content while it is selected; retry after selection clears.
  ctx.addEventListener(doc, 'selectionchange', schedule)
  const commands = {
    toggle() {
      enabled = !enabled; ctx.storage?.set('enabled', enabled)
      revision++; cache.clear(); restore(); warned = false
      host.notify({ kind: 'info', message: enabled ? '中文公式自动修复已开启' : '中文公式自动修复已暂停，已恢复原显示' })
      if (enabled) schedule()
    },
    rescan() { revision++; cache.clear(); warned = false; restore(); schedule() }
  }
  function dispose() {
    if (disposed) return
    disposed = true; revision++; cancelTimer?.(); observer.disconnect()
    for (const display of displays) display.dispose()
    displays.clear(); cache.dispose(); unsubscribers.forEach(fn => fn())
  }
  ctx.onDispose(dispose)
  observe(); schedule()
  return { scan, commands, dispose, cache, get count() { return displays.size }, get enabled() { return enabled } }
}
