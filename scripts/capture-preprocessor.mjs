// Optional integration fixture capture. Uses the user's existing checkout;
// never edits Hermes files. Media helpers are stubs and media is not tested.
import { build } from 'esbuild'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'

const repo = process.argv[2]
if (!repo) throw new Error('Usage: node scripts/capture-preprocessor.mjs <Hermes checkout>')
const desktop = path.resolve(repo, 'apps/desktop')
await mkdir('.cache', { recursive: true })
const result = await build({
  absWorkingDir: desktop, entryPoints: ['src/lib/markdown-preprocess.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node',
  alias: { '@': path.join(desktop, 'src') },
  plugins: [{ name: 'no-media', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/media$/ }, () => ({ path: 'media', namespace: 'stub' }))
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents:
      'export const mediaKind = () => "file"; export const mediaMarkdownHref = s => s;' }))
  } }]
})
await writeFile('.cache/hermes-preprocess.mjs', result.outputFiles[0].text)
const { preprocessMarkdown } = await import('../.cache/hermes-preprocess.mjs')
const sources = JSON.parse(await readFile('test/fixtures/sources.json', 'utf8'))
await writeFile('test/fixtures/preprocessed.json', JSON.stringify(sources.map(source => ({ source, preprocessed: preprocessMarkdown(source) })), null, 2) + '\n')
console.log(`Captured ${sources.length} cases with the installed Hermes source preprocessor.`)
