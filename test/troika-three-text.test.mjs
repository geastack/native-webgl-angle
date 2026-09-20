import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const repoRoot = path.dirname(packageDir)
const threeDir = path.join(repoRoot, 'examples', 'node_modules', 'three')
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gea-native-troika-test-'))

try {
  assert.ok(fs.existsSync(threeDir), 'install the Examples workspace dependencies before running this test')
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
  assert.equal(packageJson.exports['./troika-three-text'], './src/troika-three-text.ts')

  // Node's native TS loader intentionally refuses to strip `.ts` below a
  // node_modules path. Import the package source directly and use a tiny test
  // resolver for its peer dependency; the Vite resolution test covers the
  // published package subpath itself.
  const loader = path.join(temporaryRoot, 'three-loader.mjs')
  fs.writeFileSync(loader, `
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const threeDir = ${JSON.stringify(threeDir)}
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return { url: pathToFileURL(path.join(threeDir, 'build', 'three.module.js')).href, shortCircuit: true }
  }
  if (specifier.startsWith('three/')) {
    return { url: pathToFileURL(path.join(threeDir, specifier.slice('three/'.length))).href, shortCircuit: true }
  }
  if (specifier.startsWith('.') && context.parentURL && !path.extname(specifier)) {
    return { url: new URL(specifier + '.ts', context.parentURL).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
`)

  const runner = path.join(temporaryRoot, 'runner.mjs')
  fs.writeFileSync(runner, `
import assert from 'node:assert/strict'
import { Text, TroikaText } from ${JSON.stringify(pathToFileURL(path.join(packageDir, 'src', 'troika-three-text.ts')).href)}

const text = new Text()
assert.ok(text instanceof TroikaText)
assert.equal(text.text, '')
assert.equal(text.font, null)
assert.equal(text.fontSize, 1)
assert.equal(text.anchorX, 'center')
assert.equal(text.anchorY, 'middle')
assert.equal(typeof text.sync, 'function')
assert.equal(typeof text.dispose, 'function')

text.text = 'AV'
text.fontSize = 20
text.color = 0x68c3c0
text.fillOpacity = 0.65
text.letterSpacing = 0.05
text.sync()

const mesh = text.children[0]
assert.ok(mesh?.isMesh, 'Text should own a real Three Mesh')
assert.equal(mesh.geometry.getAttribute('position').count, 8, 'two visible glyphs should produce two quads')
assert.equal(mesh.geometry.getAttribute('uv').count, 8)
assert.equal(mesh.geometry.index.count, 12)
assert.ok(mesh.material.map?.isDataTexture, 'glyph atlas should be a real DataTexture')
assert.ok(mesh.material.map.image.width > 0 && mesh.material.map.image.height > 0)
assert.equal(mesh.material.opacity, 0.65)

const unchangedGeometry = mesh.geometry
const unchangedPosition = unchangedGeometry.getAttribute('position')
const unchangedUv = unchangedGeometry.getAttribute('uv')
const unchangedIndex = unchangedGeometry.index
const unchangedPositionArray = unchangedPosition.array
const unchangedUvArray = unchangedUv.array
const unchangedIndexArray = unchangedIndex.array
text.fillOpacity = 0.4
text.sync()
assert.equal(mesh.geometry, unchangedGeometry, 'paint-only sync must preserve geometry identity')
assert.equal(unchangedPosition.array, unchangedPositionArray, 'paint-only sync must skip position layout data')
assert.equal(unchangedUv.array, unchangedUvArray, 'paint-only sync must skip UV layout data')
assert.equal(unchangedIndex.array, unchangedIndexArray, 'paint-only sync must skip index layout data')
assert.equal(mesh.material.opacity, 0.4)

text.text = 'VI'
text.sync()
assert.equal(mesh.geometry, unchangedGeometry, 'same-size layout changes must preserve geometry identity')
assert.equal(mesh.geometry.getAttribute('position'), unchangedPosition, 'position attribute should retain its GL cache key')
assert.equal(mesh.geometry.getAttribute('uv'), unchangedUv, 'uv attribute should retain its GL cache key')
assert.equal(mesh.geometry.index, unchangedIndex, 'index attribute should retain its GL cache key')

let disposedReplacedGeometry = false
unchangedGeometry.addEventListener('dispose', () => {
  disposedReplacedGeometry = true
})
text.text = 'REFERENCE'
text.sync()
assert.notEqual(mesh.geometry, unchangedGeometry, 'layout changes must rebuild geometry')
assert.equal(disposedReplacedGeometry, true, 'replaced geometry must release its renderer resources')
assert.ok(mesh.geometry.getAttribute('position').count >= 24)

const regular = new Text()
regular.font = 'gea-asset://sha256/test/playfair-700.woff'
regular.text = '1'
regular.sync()
const italic = new Text()
italic.font = 'gea-asset://sha256/test/playfair-italic.woff'
italic.text = 'the'
italic.sync()
assert.notEqual(regular.children[0].material.map, italic.children[0].material.map, 'regular and italic fonts need distinct atlases')

console.log(JSON.stringify({
  exportName: Text === TroikaText,
  glyphVertices: mesh.geometry.getAttribute('position').count,
  indexedTriangles: mesh.geometry.index.count / 3,
  atlasWidth: mesh.material.map.image.width,
}))
`)

  const result = spawnSync(process.execPath, ['--experimental-loader', loader, runner], {
    cwd: temporaryRoot,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  const summary = JSON.parse(result.stdout.trim())
  assert.equal(summary.exportName, true)
  assert.ok(summary.glyphVertices > 0)
  assert.ok(summary.indexedTriangles > 0)
  assert.ok(summary.atlasWidth > 0)

  const modulesDir = path.join(temporaryRoot, 'node_modules')
  const geastackDir = path.join(modulesDir, '@geastack')
  fs.mkdirSync(geastackDir, { recursive: true })
  fs.symlinkSync(packageDir, path.join(geastackDir, 'native-webgl-angle'), 'dir')
  fs.symlinkSync(threeDir, path.join(modulesDir, 'three'), 'dir')
  fs.symlinkSync(
    path.join(repoRoot, 'examples', 'node_modules', 'troika-three-text'),
    path.join(modulesDir, 'troika-three-text'),
    'dir',
  )
  const routeEntry = path.join(temporaryRoot, 'route-entry.js')
  fs.writeFileSync(routeEntry, "export { Text } from 'troika-three-text'\n")

  const { build } = await import(
    pathToFileURL(path.join(repoRoot, 'examples', 'node_modules', 'vite', 'dist', 'node', 'index.js')).href
  )
  const {
    geaAppleNativeModuleAliases,
    geaModuleGraphPlugins,
  } = await import(
    pathToFileURL(path.join(repoRoot, 'core', 'packages', 'core', 'scripts', 'gea-vite-module-graph-plugin.mjs')).href
  )

  async function buildRoute(name, aliases) {
    const graphDir = path.join(temporaryRoot, `${name}-graph`)
    await build({
      root: temporaryRoot,
      configFile: false,
      logLevel: 'silent',
      resolve: { alias: aliases },
      plugins: geaModuleGraphPlugins({ outDir: graphDir }),
      build: {
        lib: { entry: routeEntry, formats: ['es'], fileName: () => 'index.js' },
        outDir: path.join(temporaryRoot, `${name}-dist`),
        emptyOutDir: true,
        minify: false,
      },
    })
    const graph = JSON.parse(fs.readFileSync(path.join(graphDir, 'gea-module-graph.json'), 'utf8'))
    const entry = graph.modules.find((module) => module.file === fs.realpathSync(routeEntry))
    assert.ok(entry, `${name} entry should be present in the module graph`)
    return entry.imports.find((item) => item.specifier === 'troika-three-text')?.resolvedId ?? ''
  }

  const browserResolution = await buildRoute('browser', [])
  assert.match(browserResolution, /node_modules\/troika-three-text\//, 'browser builds must keep upstream Troika')
  assert.doesNotMatch(browserResolution, /native-webgl-angle/)

  const nativeResolution = await buildRoute(
    'native',
    geaAppleNativeModuleAliases({
      threeSrcDir: path.join(threeDir, 'src'),
      troikaThreeTextModule: path.join(packageDir, 'src', 'troika-three-text.ts'),
    }),
  )
  assert.equal(nativeResolution, path.join(packageDir, 'src', 'troika-three-text.ts'))
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true })
}
