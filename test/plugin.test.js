import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { hasChineseTextCommand, renderFormula, eligibleFormula } from '../src/formulas.js'
import { parseSource, extractSource } from '../src/vendor/source-map.js'
import { projectMessage, alignProjection, selectedTokenSpan } from '../src/vendor/dom-adapter.js'
import { startController } from '../src/controller.js'
import { fixture, fakeHost, fakeContext, settle } from './helpers.js'

const cases = JSON.parse(await readFile(new URL('./fixtures/preprocessed.json', import.meta.url), 'utf8'))

async function start(item = cases[0], messages, override) {
  const f = await fixture(item.source, item.preprocessed)
  const h = fakeHost(messages || [{ role: 'assistant', text: item.source }], override)
  const ctx = fakeContext()
  const controller = startController(h.host, ctx, { ...f, delay: 0 })
  await controller.scan()
  return { ...f, ...h, ctx, controller }
}

test('text command recognition requires an exact command, a closed argument and Chinese Han', () => {
  for (const command of ['text', 'textbf', 'textit', 'textrm', 'textsf', 'texttt', 'textnormal', 'mbox']) {
    assert.equal(hasChineseTextCommand(`x=\\${command}{中文}`), true, command)
  }
  for (const body of ['x=变量', '\\text{English}', '\\textfoo{中文}', '\\\\text{中文}', '\\text{未闭合', '\\text{，：}'])
    assert.equal(hasChineseTextCommand(body), false, body)
  assert.equal(hasChineseTextCommand('\\text{中文{嵌套}说明}'), true)
  assert.equal(renderFormula('\\badcommand{\\text{中文}}'), null)
})

for (const index of [0, 1, 2, 3, 4, 5, 9, 10, 11]) test(`official preprocessing case ${index + 1}: repair and exact restoration`, async () => {
  const f = await start(cases[index])
  try {
    assert.ok(f.controller.count > 0, `Not repaired: ${cases[index].source}; notices=${JSON.stringify(f.notices)}`)
    const model = parseSource(cases[index].source)
    const projected = projectMessage(f.root)
    assert.ok(alignProjection(projected, model), 'Repaired DOM remains source-mappable')
    assert.ok(f.doc.querySelector('[data-hermes-chinese-latex-math] .katex annotation[encoding="application/x-tex"]'))
    const count = f.controller.count
    await f.controller.scan()
    assert.equal(f.controller.count, count, 'Second scan must be idempotent')
    f.ctx.dispose()
    assert.equal(f.doc.querySelector('[data-hermes-chinese-latex-copy]'), null)
    assert.equal(f.doc.querySelector('[hidden]'), null)
    const again = await fixture(cases[index].source, cases[index].preprocessed)
    assert.equal(f.root.innerHTML, again.root.innerHTML, 'Original markup restored byte-for-byte')
    again.win.close()
  } finally { f.ctx.dispose(); f.win.close() }
})

for (const index of [6, 7, 8, 12]) test(`protected content case ${index + 1}: unchanged`, async () => {
  const before = await fixture(cases[index].source, cases[index].preprocessed)
  const expected = before.root.innerHTML; before.win.close()
  const f = await start(cases[index])
  try { assert.equal(f.controller.count, 0); assert.equal(f.root.innerHTML, expected) }
  finally { f.ctx.dispose(); f.win.close() }
})

test('source-copy mapping preserves full/partial formulas and a single table cell', async () => {
  const f = await start(cases[5])
  try {
    const model = parseSource(f.source), aligned = alignProjection(projectMessage(f.root), model)
    assert.ok(aligned)
    for (const math of f.doc.querySelectorAll('[data-hermes-chinese-latex-math] .katex')) {
      const range = f.doc.createRange(); range.selectNode(math)
      const full = extractSource(model, ...selectedTokenSpan(aligned, range))
      const node = f.doc.createTreeWalker(math.querySelector('.katex-html'), 4).nextNode()
      const part = f.doc.createRange(); part.setStart(node, 0); part.setEnd(node, 1)
      assert.equal(extractSource(model, ...selectedTokenSpan(aligned, part)), full)
      assert.match(full, /^\$.*\$$/)
      assert.ok(!full.includes('|'), 'Cell selection does not expand to the table')
    }
  } finally { f.ctx.dispose(); f.win.close() }
})

test('streaming roots are untouched; completion invalidates stale history and repairs', async () => {
  const f = await fixture(cases[0].source, cases[0].preprocessed)
  f.root.setAttribute('data-message-streaming', 'true')
  const h = fakeHost([{ role: 'assistant', text: f.source }]), ctx = fakeContext()
  const controller = startController(h.host, ctx, { ...f, delay: 0 })
  try {
    await controller.scan(); assert.equal(controller.count, 0); assert.equal(h.calls.length, 0)
    f.root.removeAttribute('data-message-streaming'); ctx.emit('message.complete', { session_id: 'runtime-1' })
    await settle(); assert.equal(controller.count, 1)
    f.root.setAttribute('data-message-streaming', 'true'); await settle()
    assert.equal(controller.count, 0); assert.equal(f.doc.querySelector('[hidden]'), null)
  } finally { ctx.dispose(); f.win.close() }
})

test('host text updates, detached originals, pause and re-enable clean up copies', async () => {
  const f = await start()
  try {
    const original = f.doc.querySelector('p[hidden]')
    original.firstChild.nodeValue = '宿主已更新'
    await settle(); assert.equal(f.controller.count, 0); assert.equal(original.hidden, false)
    original.innerHTML = (await fixture(f.source, cases[0].preprocessed)).doc.querySelector('p').innerHTML
    await settle(); assert.equal(f.controller.count, 1)
    f.controller.commands.toggle(); assert.equal(f.controller.count, 0); assert.equal(original.hidden, false)
    await settle(); assert.equal(f.controller.count, 0)
    f.controller.commands.toggle(); await settle(); assert.equal(f.controller.count, 1)
    original.remove(); await settle(); assert.equal(f.controller.count, 0)
    assert.equal(f.doc.querySelector('[data-hermes-chinese-latex-copy]'), null)
  } finally { f.ctx.dispose(); f.win.close() }
})

test('link click and modifier keys are forwarded to the original host handler', async () => {
  const f = await start(cases[10])
  try {
    let received = null
    f.doc.querySelector('p[hidden] a').addEventListener('click', event => { event.preventDefault(); received = event })
    const link = f.doc.querySelector('[data-hermes-chinese-latex-copy] a')
    const event = new f.win.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    link.dispatchEvent(event)
    assert.equal(received?.ctrlKey, true); assert.equal(event.defaultPrevented, true)
  } finally { f.ctx.dispose(); f.win.close() }
})

test('ambiguous duplicate history and unavailable source preserve the display', async () => {
  const item = cases[0]
  const f = await start(item, [{ role: 'assistant', text: item.source }, { role: 'assistant', text: item.source }])
  assert.equal(f.controller.count, 0); f.ctx.dispose(); f.win.close()
  const failed = await start(item, undefined, () => { throw new Error('offline') })
  try {
    assert.equal(failed.controller.count, 0); assert.equal(failed.notices.length, 1)
    await failed.controller.scan(); assert.equal(failed.notices.length, 1)
  } finally { failed.ctx.dispose(); failed.win.close() }
})

test('scope change while a request is pending cannot paint stale formulas', async () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  const f = await fixture(cases[0].source, cases[0].preprocessed)
  const h = fakeHost([], (_route, _method, params) => params.session_id === 'runtime-1' ? promise : { messages: [] }), ctx = fakeContext()
  const controller = startController(h.host, ctx, { ...f, delay: 0 })
  const pending = controller.scan()
  await settle()
  h.host.state.focusedStoredSessionId.set('other-chat')
  h.host.state.focusedSessionId.set('runtime-2')
  h.host.state.activeSessionId.set('runtime-2')
  resolve({ messages: [{ role: 'assistant', text: f.source }] })
  await pending; await settle()
  assert.equal(controller.count, 0)
  ctx.dispose(); f.win.close()
})

test('active selection is preserved; clearing it allows repair', async () => {
  const f = await fixture(cases[0].source, cases[0].preprocessed)
  const range = f.doc.createRange(); range.selectNodeContents(f.doc.querySelector('p'))
  f.doc.getSelection().addRange(range)
  const h = fakeHost([{ role: 'assistant', text: f.source }]), ctx = fakeContext()
  const controller = startController(h.host, ctx, { ...f, delay: 0 })
  try {
    await controller.scan(); assert.equal(controller.count, 0); assert.ok(!f.doc.getSelection().isCollapsed)
    f.doc.getSelection().removeAllRanges(); f.doc.dispatchEvent(new f.win.Event('selectionchange'))
    await settle(); assert.equal(controller.count, 1)
  } finally { ctx.dispose(); f.win.close() }
})

test('unsafe interactive blocks are skipped; disposal releases state listeners', async () => {
  const f = await fixture(cases[0].source, cases[0].preprocessed)
  f.doc.querySelector('p').append(f.doc.createElement('button'))
  const h = fakeHost([{ role: 'assistant', text: f.source }]), ctx = fakeContext()
  const controller = startController(h.host, ctx, { ...f, delay: 0 })
  await controller.scan(); assert.equal(controller.count, 0)
  ctx.dispose()
  assert.equal(h.host.state.focusedSessionId.count, 0)
  f.win.close()
})

test('only single-dollar inline atoms qualify', () => {
  for (const source of ['$$\\text{中文}$$', '\\(\\text{中文}\\)', '`$\\text{中文}$`', '\\$\\text{中文}$']) {
    const model = parseSource(source)
    assert.ok(model.tokens.every(token => !eligibleFormula(model, token)), source)
  }
})
