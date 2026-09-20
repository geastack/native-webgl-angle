import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from '../geatsc-plugin.mjs'

const root = fileURLToPath(new URL('./', import.meta.resolve('three/src/constants.js')))
const transform = plugin.configure().hostShims.transformSource
function read(relative) {
  const fileName = path.join(root, relative)
  return transform({ fileName, text: fs.readFileSync(fileName, 'utf8') })
}
const source = read('renderers/webgl/WebGLIndexedBufferRenderer.js')
const Renderer = new Function(source.replace(/export \{[^}]+\};?/, '') + '\nreturn WebGLIndexedBufferRenderer;')()
const draws = []
const updates = []
const gl = {
  drawElements: (...args) => draws.push(args),
  drawElementsInstanced: (...args) => draws.push(args),
}
const renderer = new Renderer(gl, { get: () => ({
  multiDrawElementsWEBGL: (...args) => draws.push(args),
}) }, { update: (...args) => updates.push(args) })
renderer.setMode(4)
renderer.setIndexValues(5123, 2)
renderer.render(3, 6)
renderer.renderInstances(4, 9, 2)
renderer.renderInstances(0, 7, 0)
renderer.setIndex({ type: 5125, bytesPerElement: 4 })
renderer.render(3, 6)
assert.deepEqual(draws, [[4, 6, 5123, 6], [4, 9, 5123, 8, 2], [4, 6, 5125, 12]])
assert.deepEqual(updates, [[6, 4, 1], [9, 4, 2], [6, 4, 1]])
const starts = new Int32Array([0, 12])
const counts = new Int32Array([3, 6])
renderer.renderMultiDraw(starts, counts, 2)
assert.deepEqual(draws.at(-1), [4, counts, 0, 5125, starts, 0, 2])
assert.deepEqual(updates.at(-1), [9, 4, 1])

const adapted = read('renderers/WebGLRenderer.js')
assert.doesNotMatch(adapted, /let renderer = bufferRenderer|renderer = indexedBufferRenderer|setIndex\( \{/)
// Exercise every transformed dispatch with both index states, including calls
// under surrounding branches: each call must reach exactly one concrete renderer.
const calls = [...adapted.matchAll(/if \( index !== null \) indexedBufferRenderer\.(\w+)\( ([^;\n]+) \); else bufferRenderer\.\1\( \2 \);/g)]
assert.equal(calls.length, 12)
for (const [statement, method] of calls) {
  for (const index of [null, {}]) {
    const events = []
    const indexedBufferRenderer = { [method]: (...args) => events.push(['indexed', ...args]) }
    const bufferRenderer = { [method]: (...args) => events.push(['plain', ...args]) }
    new Function('index', 'indexedBufferRenderer', 'bufferRenderer', '_gl', 'starts', 'counts', 'i',
      'bytesPerElement', 'object', 'drawStart', 'drawCount', 'instanceCount', statement)(
      index, indexedBufferRenderer, bufferRenderer, { LINES: 1, TRIANGLES: 4, LINE_LOOP: 2, LINE_STRIP: 3, POINTS: 0 },
      [8], [6], 0, 2, { _multiDrawStarts: starts, _multiDrawCounts: counts, _multiDrawCount: 2, count: 3 }, 1, 6, 3)
    assert.equal(events.length, 1)
    assert.equal(events[0][0], index === null ? 'plain' : 'indexed')
  }
}
console.log('Native draw dispatch preserves index formats, byte offsets, instancing and multidraw')
