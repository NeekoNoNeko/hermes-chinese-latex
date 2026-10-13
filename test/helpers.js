import { JSDOM } from 'jsdom'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'

export async function fixture(source, preprocessed = source) {
  const html = String(await unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkRehype).use(rehypeKatex, { strict: 'ignore' }).use(rehypeStringify).process(preprocessed))
  const dom = new JSDOM('<!doctype html><body><div data-chat-surface data-composer-target="main"><div data-slot="aui_assistant-message-root" data-role="assistant"><div data-slot="aui_assistant-message-content"><div class="aui-md"></div></div></div></div></body>', { url: 'https://hermes.invalid', runScripts: 'outside-only' })
  const doc = dom.window.document
  doc.querySelector('.aui-md').innerHTML = html
  return { dom, doc, win: dom.window, root: doc.querySelector('[data-role="assistant"]'), source }
}

export function atom(value) {
  const subscribers = new Set()
  return { get: () => value, set(next) { value = next; subscribers.forEach(fn => fn(next)) }, listen(fn) { subscribers.add(fn); return () => subscribers.delete(fn) }, get count() { return subscribers.size } }
}

export function fakeHost(messages, requestOverride) {
  const notices = [], calls = []
  const host = {
    state: {
      activeSessionId: atom('runtime-1'), focusedSessionId: atom('runtime-1'),
      focusedStoredSessionId: atom('stored-1'), focusedSessionOwner: atom({ connectionId: 'local', profile: 'default' }), gateway: atom('open')
    },
    notify(notice) { notices.push(notice) },
    async requestProfile(...args) { calls.push(args); return requestOverride ? requestOverride(...args) : { messages } }
  }
  return { host, notices, calls }
}

export function fakeContext() {
  const dispose = [], values = new Map(), events = new Map()
  return {
    storage: { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, set: (key, value) => values.set(key, value) },
    setTimeout(fn, ms) { const id = setTimeout(fn, ms); const off = () => clearTimeout(id); dispose.push(off); return off },
    addEventListener(target, type, fn) { target.addEventListener(type, fn); const off = () => target.removeEventListener(type, fn); dispose.push(off); return off },
    onEvent(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); const off = () => events.get(type).delete(fn); dispose.push(off); return off },
    onDispose(fn) { dispose.push(fn) },
    emit(type, payload = {}) { events.get(type)?.forEach(fn => fn({ type, payload })) },
    dispose() { dispose.splice(0).reverse().forEach(fn => fn()) }
  }
}

export const settle = () => new Promise(resolve => setTimeout(resolve, 25))
