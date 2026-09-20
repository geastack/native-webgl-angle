import assert from 'node:assert/strict'
import fs from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// The same TypeScript the compiler itself uses. This package's own
// devDependency is `latest`, and TypeScript 7 moved the compiler API behind
// ./unstable/*, so a bare `typescript` import resolves to a version stub.
const ts = createRequire(import.meta.resolve('@geastack/compiler/package.json'))('typescript')

const source = ts.createSourceFile('nativeWebGL.ts', fs.readFileSync(new URL('../src/nativeWebGL.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
const context = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'NativeWebGL2RenderingContext')
assert.ok(context)
const names = ['bufferData', 'bufferDataWithKind', 'bufferSubData', 'bufferSubDataWithKind', 'uniformMatrix3fv', 'uniformMatrix4fv', 'uniform2fv', 'uniform2iv', 'uniform2uiv']
const methods = context.members.filter(node => names.includes(node.name?.getText(source)))
const helpers = source.statements.filter(node => ts.isFunctionDeclaration(node) && ['typedArrayKind', 'zeroF32Array', 'nullableNativeHandle'].includes(node.name?.text))
const js = ts.transpileModule(helpers.map(node => node.getText(source)).join('\n') + '\nclass Context {\n' + methods.map(node => node.getText(source)).join('\n') + '\n}', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const calls = []
const record = (...args) => calls.push(args)
const create = new Function('threeWebGLBufferData', 'threeWebGLBufferSubData', 'threeWebGLBufferSubDataRange', 'threeWebGLUniformMatrix3fv', 'threeWebGLUniformMatrix4fv', 'threeWebGLUniform2fv', 'threeWebGLUniform2iv', 'threeWebGLUniform2uiv', js + '\nreturn new Context();')
const gl = create(record, record, record, record, record, record, record, record)
for (const value of [[1,2,3], new Float32Array([1,2,3]), new Uint16Array([1,2,3]), null]) {
  gl.bufferData(1, value, 2)
  assert.equal(calls.at(-1)[3], value)
  gl.bufferSubData(1, 4, value)
  assert.equal(calls.at(-1)[3], value)
  gl.uniformMatrix4fv(null, false, value)
  assert.equal(calls.at(-1)[3], value)
}
const data = new Uint16Array([10,20,30,40])
gl.bufferSubDataWithKind(1, 12, data, 2, 1, 2)
assert.deepEqual(calls.at(-1), [1,12,2,data,1,2])
gl.bufferSubDataWithKind(1, 12, data, 2, 3, 8)
assert.deepEqual(calls.at(-1), [1,12,2,data,3,1])
for (const name of ['uniform2fv', 'uniform2iv', 'uniform2uiv']) {
  const values = new Float32Array([1,2,3,4])
  gl[name](null, values)
  assert.equal(calls.at(-1)[1], values)
  assert.equal(calls.at(-1)[1].length, 4)
}
console.log('Upload facade preserves native source identity and source ranges')
