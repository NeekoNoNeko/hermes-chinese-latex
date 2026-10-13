import { build } from 'esbuild'
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const out = path.join(root, 'dist', 'hermes-chinese-latex')
await mkdir(out, { recursive: true })
const result = await build({
  absWorkingDir: root, entryPoints: ['src/plugin.js'], outfile: path.join(out, 'plugin.js'),
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022',
  external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'], metafile: true,
  legalComments: 'eof', banner: { js: `// Hermes Chinese LaTeX ${version} — MIT — host source baseline dce1e9b375` }
})
const imports = Object.values(result.metafile.outputs).flatMap(output => output.imports)
if (imports.some(item => !['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'].includes(item.path))) throw new Error('Unsupported runtime import')
const bytes = await readFile(path.join(out, 'plugin.js'))
await writeFile(path.join(root, 'plugin.js'), bytes)
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
const notices = ['Bundled dependencies in Hermes Chinese LaTeX\n', await readFile(path.join(root, 'src/vendor/LICENSE.hermes-source-copy'), 'utf8')]
for (const [packagePath, item] of Object.entries(lock.packages)) {
  if (!packagePath || item.dev) continue
  const name = item.name || packagePath.split('node_modules/').at(-1)
  notices.push(`\n===== ${name} ${item.version} (${item.license || 'see package license'}) =====\n`)
  for (const candidate of ['license', 'LICENSE', 'LICENSE.md', 'LICENSE-MIT', 'license.md', 'LICENSE.txt']) {
    try { notices.push(await readFile(path.join(root, packagePath, candidate), 'utf8')); break } catch { /* Next license name. */ }
  }
}
await writeFile(path.join(root, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n'))
await writeFile(path.join(out, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n'))
await writeFile(path.join(out, 'SHA256.txt'), `${createHash('sha256').update(bytes).digest('hex')}  plugin.js\n`)
await writeFile(path.join(out, 'build-info.json'), JSON.stringify({
  id: 'hermes-chinese-latex', version, hermesSourceBaseline: 'dce1e9b375',
  katex: lock.packages['node_modules/katex'].version,
  sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length
}, null, 2) + '\n')
for (const name of ['README.md', 'LICENSE', 'VERIFICATION.md']) {
  try { await copyFile(path.join(root, name), path.join(out, name)) }
  catch (error) { if (name !== 'VERIFICATION.md' || error.code !== 'ENOENT') throw error }
}
await mkdir(path.join(out, 'scripts'), { recursive: true })
for (const name of ['install.ps1', 'uninstall.ps1', 'path-safety.ps1'])
  await copyFile(path.join(root, 'scripts', name), path.join(out, 'scripts', name))
console.log(`Built plugin.js (${bytes.length} bytes); SDK-only runtime imports verified.`)
