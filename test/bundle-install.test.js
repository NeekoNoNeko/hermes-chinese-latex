import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('distribution is self-contained and every published JavaScript hash agrees', async () => {
  const root = await readFile(new URL('../plugin.js', import.meta.url))
  const dist = await readFile(new URL('../dist/hermes-chinese-latex/plugin.js', import.meta.url))
  const info = JSON.parse(await readFile(new URL('../dist/hermes-chinese-latex/build-info.json', import.meta.url)))
  assert.deepEqual(root, dist)
  assert.equal(createHash('sha256').update(root).digest('hex'), info.sha256)
  assert.match(root.toString(), /from "@hermes\/plugin-sdk"/)
  assert.ok(!/\bimport\s*\(/.test(root.toString()), 'No lazy runtime dependency loading')
  assert.ok(!root.toString().includes('https://cdn.'))
  const notices = await readFile(new URL('../THIRD_PARTY_NOTICES.txt', import.meta.url), 'utf8')
  assert.match(notices, /Hermes Source Copy contributors/)
  assert.match(notices, /katex 0\.18\.2/)
})

test('Windows installer validates bytes, preserves a previous version, and uninstalls only its own folder', { skip: process.platform !== 'win32' }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hermes-chinese-latex-test-'))
  const expected = await readFile(new URL('../plugin.js', import.meta.url))
  const plugin = path.join(dir, 'desktop-plugins', 'hermes-chinese-latex', 'plugin.js')
  const other = path.join(dir, 'desktop-plugins', 'unrelated-plugin')
  await mkdir(other, { recursive: true })
  function run(name) {
    const script = new URL(`../scripts/${name}.ps1`, import.meta.url)
    const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(script), '-HermesHome', dir], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    return result.stdout
  }
  try {
    run('install'); assert.deepEqual(await readFile(plugin), expected)
    run('install')
    const backups = await readdir(path.join(dir, 'desktop-plugin-backups'))
    assert.equal(backups.length, 1)
    assert.deepEqual(await readFile(path.join(dir, 'desktop-plugin-backups', backups[0], 'plugin.js')), expected)
    run('uninstall')
    assert.deepEqual(await readdir(path.join(dir, 'desktop-plugins')), ['unrelated-plugin'])
    assert.equal((await readdir(path.join(dir, 'desktop-plugin-backups'))).length, 1)
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()))
    assert.ok(path.basename(dir).startsWith('hermes-chinese-latex-test-'))
    await rm(dir, { recursive: true, force: true })
  }
})
