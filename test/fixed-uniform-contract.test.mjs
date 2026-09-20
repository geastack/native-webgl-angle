import assert from 'node:assert/strict'
import { nativeFixedUniforms, nativeWebGLUniformsSource, nativeUniformBindingHelpers } from '../geatsc-plugin-uniforms.mjs'

class SingleUniform {}
const calls = []
const upload = (uniform, gl, value, textures) => calls.push({ uniform, gl, value, textures })
const context = {}
const value = {}
for (const [name, type, usesTextures] of nativeFixedUniforms) {
  const start = nativeWebGLUniformsSource.indexOf(`set_${name}( gl, value`)
  assert.ok(start >= 0)
  const end = nativeWebGLUniformsSource.indexOf('\n  }', start)
  assert.ok(end > start)
  const method = nativeWebGLUniformsSource.slice(start, end + 4)
  const holder = new Function('SingleUniform', 'setNativeMatrix3UniformValue', 'setNativeMatrix4UniformValue', 'setNativeUniformValue',
    `return { map: {}, ${method} }`)(SingleUniform, upload, upload, upload)
  const textures = usesTextures ? {} : undefined
  const set = value => holder[`set_${name}`](context, value, textures)
  const before = calls.length
  set(value)
  assert.equal(calls.length, before, `${name}: absent uniforms are skipped`)
  const original = new SingleUniform()
  holder.map[name] = original
  set(value)
  assert.deepEqual(calls.at(-1), { uniform: original, gl: context, value, textures })
  const replacement = new SingleUniform()
  holder.map[name] = replacement
  set(value)
  assert.equal(calls.at(-1).uniform, replacement, `${name}: replacement must not use a stale cached uniform`)
  delete holder.map[name]
  const after = calls.length
  set(value)
  assert.equal(calls.length, after)
  if (type === 'Matrix3' || type === 'Matrix4') {
    holder.map[name] = {}
    assert.throws(() => set(value), /requires a single uniform/)
  }
}

const start = nativeWebGLUniformsSource.indexOf('static upload( gl, seq, values, textures, clippingPlanes ) {')
const end = nativeWebGLUniformsSource.indexOf('\n\t/**', start)
const source = nativeWebGLUniformsSource.slice(start, end).replace('static upload', 'upload')
const { upload: uploadSequence } = new Function('setNativeUniformValue', `${nativeUniformBindingHelpers}; return { ${source} }`)(upload)
const first = { id: 'long-uniform-name-for-read-count' }
const clipping = { id: 'clippingPlanes', nativeBindingSlot: -1 }
const values = { [first.id]: { value: 12 }, clippingPlanes: { value: 13 } }
const before = calls.length
uploadSequence(context, [first, clipping], values, undefined, { value: 14, needsUpdate: false })
assert.equal(calls.length, before + 1)
assert.equal(calls.at(-1).value, 12)
values[first.id] = { value: 15 }
uploadSequence(context, [first, clipping], values, undefined, undefined)
assert.deepEqual(calls.slice(-2).map(call => call.value), [15, 13])
console.log('Fixed uniform setters preserve replacement, deletion, missing values, matrix validation and clipping behavior')
