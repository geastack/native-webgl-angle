import assert from 'node:assert/strict'
import { nativeUniformBindingHelpers, nativeUniformBindingNames, nativeWebGLUniformsSource } from '../geatsc-plugin-uniforms.mjs'

const calls = []
const start = nativeWebGLUniformsSource.indexOf('static upload( gl, seq, values, textures, clippingPlanes ) {')
const end = nativeWebGLUniformsSource.indexOf('\n\t/**', start)
const upload = nativeWebGLUniformsSource.slice(start, end).replace('static upload', 'upload')
const helpers = new Function('setNativeUniformValue', `${nativeUniformBindingHelpers}
  return { classify: nativeUniformBindingSlot, ${upload} };`)(
  (uniform, gl, value, textures) => calls.push({ uniform, gl, value, textures }))
const gl = {}, textures = {}

// Exercise real constructor initialization for all three node kinds.
for (const name of ['SingleUniform', 'PureArrayUniform', 'StructuredUniform']) {
  const begin = nativeWebGLUniformsSource.indexOf(`class ${name} {`)
  const finish = nativeWebGLUniformsSource.indexOf('\n\t}', begin)
  const constructor = nativeWebGLUniformsSource.slice(begin, finish + 3) + '\n}'
  const Type = new Function('getSingularSetter', 'getPureArraySetter', `${nativeUniformBindingHelpers}; return (${constructor});`)(() => {}, () => {})
  for (const id of [...nativeUniformBindingNames, 'clippingPlanes', 'customName']) {
    assert.equal(new Type(id, { type: 1, size: 1 }, {}).nativeBindingSlot, helpers.classify(id))
  }
}

for (const name of nativeUniformBindingNames) {
  const uniform = { nativeBindingSlot: helpers.classify(name), get id() { throw new Error('upload copied a known name') } }
  const values = { [name]: { value: 12 } }
  helpers.upload(gl, [uniform], values, textures, undefined)
  assert.deepEqual(calls.at(-1), { uniform, gl, value: 12, textures })
  values[name] = { value: 23 }
  helpers.upload(gl, [uniform], values, textures, undefined)
  assert.equal(calls.at(-1).value, 23, `${name}: read replacement cell`)
  values[name].value = 34
  helpers.upload(gl, [uniform], values, textures, undefined)
  assert.equal(calls.at(-1).value, 34, `${name}: read edited value`)
  values[name].needsUpdate = false
  const count = calls.length
  helpers.upload(gl, [uniform], values, textures, undefined)
  assert.equal(calls.length, count)
  delete values[name]
  assert.throws(() => helpers.upload(gl, [uniform], values, textures, undefined), TypeError,
    `${name}: deletion keeps the original missing-cell error`)
  helpers.upload(gl, [uniform], Object.create({ [name]: { value: 45 } }), textures, undefined)
  assert.equal(calls.at(-1).value, 45, `${name}: inherited values remain visible`)
}

const custom = { id: 'custom-uniform-name-longer-than-small-string-storage', nativeBindingSlot: 0 }
helpers.upload(gl, [custom], { [custom.id]: { value: 56 } }, textures, undefined)
assert.equal(calls.at(-1).value, 56)
const clipping = { id: 'clippingPlanes', nativeBindingSlot: -1 }
helpers.upload(gl, [clipping], {}, textures, { value: 67, needsUpdate: true })
assert.equal(calls.at(-1).value, 67)
helpers.upload(gl, [clipping], { clippingPlanes: { value: 78 } }, textures, undefined)
assert.equal(calls.at(-1).value, 78)
console.log('Uniform bindings preserve live cells, inheritance, missing errors, custom names and clipping without copying known names')
