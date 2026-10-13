import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { transform } from 'esbuild'
import { startController } from '../src/controller.js'
import { fixture, fakeHost, fakeContext, settle } from './helpers.js'

const pluginPath = process.env.HERMES_SOURCE_COPY_PLUGIN || new URL('../../HermesFormulaPlugin/plugin.js', import.meta.url)
const available = await access(pluginPath).then(() => true, () => false)

test('actual prebuilt source-copy plugin copies complete/partial repaired table formulas', { skip: !available }, async () => {
  const items = JSON.parse(await readFile(new URL('./fixtures/preprocessed.json', import.meta.url), 'utf8'))
  const item = items[5], f = await fixture(item.source, item.preprocessed)
  const { host } = fakeHost([{ role: 'assistant', text: item.source }])
  const ctx = fakeContext(), copyCtx = fakeContext()
  copyCtx.registerMany = () => {}
  const controller = startController(host, ctx, { ...f, delay: 0 })
  try {
    await controller.scan(); assert.equal(controller.count, 2)
    // The entire existing prebuilt plugin is evaluated with only its SDK door
    // substituted. No changes are made to the source-copy checkout/install.
    const source = (await readFile(pluginPath, 'utf8')).replace(/import\s*\{\s*host,\s*PALETTE_AREA\s*\}\s*from\s*['"]@hermes\/plugin-sdk['"];?/, 'const { host, PALETTE_AREA } = globalThis.__testSdk;')
    const { code } = await transform(source, { format: 'iife', globalName: 'SourceCopyTest', target: 'es2022' })
    f.win.__testSdk = { host, PALETTE_AREA: 'palette' }
    f.win.__copyContext = copyCtx
    f.win.eval(code + '\nSourceCopyTest.default.register(globalThis.__copyContext);')
    await settle()
    for (const math of f.doc.querySelectorAll('[data-hermes-chinese-latex-math] .katex')) {
      const expected = '$' + math.querySelector('annotation[encoding="application/x-tex"]').textContent + '$'
      for (const partial of [false, true]) {
        const range = f.doc.createRange()
        if (partial) {
          const node = f.doc.createTreeWalker(math.querySelector('.katex-html'), 4).nextNode()
          range.setStart(node, 0); range.setEnd(node, Math.min(1, node.length))
        } else range.selectNode(math)
        f.doc.getSelection().removeAllRanges(); f.doc.getSelection().addRange(range)
        const data = new Map()
        const event = new f.win.Event('copy', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'clipboardData', { value: { clearData: () => data.clear(), setData: (key, value) => data.set(key, value) } })
        f.doc.getSelection().anchorNode.parentElement.dispatchEvent(event)
        assert.equal(data.get('text/plain'), expected)
        assert.equal(event.defaultPrevented, true)
      }
    }
  } finally { copyCtx.dispose(); ctx.dispose(); f.win.close() }
})
