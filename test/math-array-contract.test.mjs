import assert from 'node:assert/strict'
import fs from 'node:fs'
import path, { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import plugin from '../geatsc-plugin.mjs'
import { nativeTestOutDir } from './out-dir.mjs'
import { compile } from '@geastack/compiler/dist/compiler.js'
const runtimeInclude = dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/src/targets/cpp/runtime/gea_runtime_builtins.cpp')))

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const threeSrc = fileURLToPath(new URL('./', import.meta.resolve('three/src/constants.js')))
const transform = plugin.configure().hostShims.transformSource
const classes = []
function method(text, name) {
  const start = text.indexOf(`\n\t${name}( `)
  assert.ok(start >= 0)
  const comment = text.lastIndexOf('\n\t/**', start)
  const end = text.indexOf('\n\t}', start)
  assert.ok(comment >= 0 && end > start)
  return text.slice(comment, end + 3)
}
for (const [name, fields] of [['Color', ['r', 'g', 'b']], ['Vector4', ['x', 'y', 'z', 'w']]]) {
  const fileName = path.join(threeSrc, `math/${name}.js`)
  const upstream = fs.readFileSync(fileName, 'utf8')
  const transformed = transform({ fileName, text: upstream })
  const methods = method(transformed, 'fromArray') + method(transformed, 'toArray')
  assert.match(methods, /@param \{Array<number>\|Int8Array\|Uint8Array/)
  assert.match(methods, /@return \{Array<number>\|Int8Array\|Uint8Array/)
  const declaration = `class ${name} { constructor() { ${fields.map((field, i) => `this.${field} = ${i + 1};`).join(' ')} } ${methods} }`
  const Actual = new Function(`return (${declaration})`)()
  const Reference = new Function(`return (class { ${method(upstream, 'fromArray')} ${method(upstream, 'toArray')} })`)()
  for (const Type of [Array, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array]) {
    const actual = new Actual()
    const reference = new Reference()
    for (const field of fields) reference[field] = actual[field]
    const output = new Type(8).fill(9)
    const expected = new Type(8).fill(9)
    assert.equal(actual.toArray(output, 2), output, `${name} preserves output identity`)
    reference.toArray(expected, 2)
    assert.deepEqual(output, expected)
    assert.equal(actual.fromArray(output, 2), actual)
    assert.deepEqual(actual.toArray(), fields.map((_, i) => i + 1))
  }
  classes.push(declaration)
}
console.log('Color/Vector4 array methods preserve identity, offsets, defaults and all numeric typed-array formats')

if (process.argv.includes('--native')) {
  const entry = path.join(packageDir, 'test/math-array-native-entry.js')
  const source = `${classes.join('\n')}
const color = new Color();
const vector = new Vector4();
const floats = new Float32Array(8);
const integers = new Uint32Array(8);
console.log(color.toArray(floats, 2) === floats);
console.log(vector.toArray(integers, 1) === integers);
console.log(color.fromArray(floats, 2).b);
console.log(vector.fromArray(integers, 1).w);
console.log(color.toArray()[2]);
console.log(vector.toArray()[3]);
`
  const result = compile({ rootFileNames: [entry], projectFileName: null, sourceOverlay: new Map([[entry, source]]) })
  assert.ok(result.certificate && result.source, JSON.stringify({ diagnostics: result.diagnostics.diagnostics, refusals: result.refusals.filter(item => item.stage !== 'census') }))
  const code = result.source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, ' ')
  assert.doesNotMatch(code, /\bgea_cpp_value\b|\bgea\s*::\s*Value\b/)
  const binary = join(nativeTestOutDir(), 'math-array-contract-test')
  execFileSync(process.env.CXX ?? 'clang++', ['-std=c++20', '-O1', '-fsanitize=address,undefined',
    `-I${runtimeInclude}`, '-x', 'c++', '-', '-o', binary], {
    input: `${result.source}\nint main() { __gea_top_level(); }\n`,
    env: { ...process.env, TMPDIR: nativeTestOutDir() }, stdio: ['pipe', 'inherit', 'inherit'],
  })
  assert.equal(execFileSync(binary, {
    encoding: 'utf8', env: { ...process.env, UBSAN_OPTIONS: 'halt_on_error=1' },
  }), 'true\ntrue\n3\n4\n3\n4\n')
  console.log('Native math array methods pass without boxing under ASan/UBSan')
}
