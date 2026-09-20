import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from '../geatsc-plugin.mjs'

const root = fileURLToPath(new URL('./', import.meta.resolve('three/src/constants.js')))
const transform = plugin.configure().hostShims.transformSource
const fileName = path.join(root, 'renderers/webgl/WebGLRenderLists.js')
const source = transform({ fileName, text: fs.readFileSync(fileName, 'utf8') })
assert.doesNotMatch(source, /a: any|b: any/)
assert.match(source, /@param \{[^\n]+\} a @param \{[^\n]+\} b \*\/\nfunction painterSortStable/)
const { WebGLRenderList } = new Function(source.replace(/export \{[^}]+\};?/, '') + '\nreturn { WebGLRenderList };')()
const list = WebGLRenderList()
const geometry = {}
const material = { id: 1, transmission: 0, transparent: false }
for (const id of [3, 1, 2]) list.push({ id, renderOrder: 0 }, geometry, material, 0, 0, null)
list.sort(null, null, false)
assert.deepEqual(list.opaque.map(item => item.id), [1, 2, 3])
let calls = 0
list.sort((a, b) => {
  ++calls
  assert.equal(a.geometry, geometry)
  assert.equal(b.material, material)
  return b.id - a.id
}, null, false)
assert.ok(calls > 0)
assert.deepEqual(list.opaque.map(item => item.id), [3, 2, 1])
const rendererFile = path.join(root, 'renderers/WebGLRenderer.js')
const renderer = transform({ fileName: rendererFile, text: fs.readFileSync(rendererFile, 'utf8') })
assert.doesNotMatch(renderer, /a: any, b: any/)
console.log('Native render-sort contracts preserve default order, custom comparators and object identity')
