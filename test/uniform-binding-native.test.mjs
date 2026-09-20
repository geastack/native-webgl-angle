import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path, { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { nativeUniformBindingHelpers } from '../geatsc-plugin-uniforms.mjs'
import { nativeTestOutDir } from './out-dir.mjs'
const runtimeInclude = dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/src/targets/cpp/runtime/gea_runtime_builtins.cpp')))

const packageDir = fileURLToPath(new URL('..', import.meta.url))
import { compile } from '@geastack/compiler/dist/compiler.js'
const entry = path.join(packageDir, 'test/uniform-binding-native-entry.js')
// Keep the actual classifier and lookup bodies. The isolated slot value is a
// number; the full game additionally verifies Three's complete value union.
const helpers = nativeUniformBindingHelpers.replaceAll("import('../shaders/UniformsLib.js').NativeUniformSlot", 'NativeUniformSlot')
const source = `
/** @typedef {{ value: number, needsUpdate?: boolean }} NativeUniformSlot */
/** @typedef {Record<string, NativeUniformSlot>} NativeUniforms */
class NativeUniform {
  /** @param {string} id */
  constructor(id) { this.id = id; this.nativeBindingSlot = nativeUniformBindingSlot(id); }
}
${helpers}
/** @type {NativeUniforms} */
const values = {};
const uniform = new NativeUniform('directionalLights');
console.log(nativeUniformBindingValue(values, uniform) === undefined);
values.directionalLights = { value: 12 };
console.log(nativeUniformBindingValue(values, uniform)?.value);
values.directionalLights = { value: 23 };
console.log(nativeUniformBindingValue(values, uniform)?.value);
delete values.directionalLights;
console.log(nativeUniformBindingValue(values, uniform) === undefined);
values.customUniformWithLongName = { value: 34 };
console.log(nativeUniformBindingValue(values, new NativeUniform('customUniformWithLongName'))?.value);
console.log(nativeUniformBindingValue(values, new NativeUniform('absentCustomName')) === undefined);
console.log(nativeUniformBindingSlot('clippingPlanes'));
`
const result = compile({ rootFileNames: [entry], projectFileName: null, sourceOverlay: new Map([[entry, source]]) })
assert.ok(result.certificate && result.source, JSON.stringify({ diagnostics: result.diagnostics, refusals: result.refusals, emission: result.emissionRefusals }))
const code = result.source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, ' ')
const binary = join(nativeTestOutDir(), 'uniform-binding-contract-test')
execFileSync(process.env.CXX ?? 'clang++', ['-std=c++20', '-O1', '-fsanitize=address,undefined',
  `-I${runtimeInclude}`, '-x', 'c++', '-', '-o', binary], {
  input: `${result.source}\nint main() { __gea_top_level(); }\n`,
  env: { ...process.env, TMPDIR: nativeTestOutDir() }, stdio: ['pipe', 'inherit', 'inherit'],
})
assert.equal(execFileSync(binary, { encoding: 'utf8' }), 'true\n12\n23\ntrue\n34\ntrue\n-1\n')
console.log('Native named/custom lookup, replacement and absence outputs pass under ASan/UBSan')
const boxedLines = code.split('\n').filter(line => /\bgea_cpp_value\b|\bgea\s*::\s*Value\b/.test(line))
assert.deepEqual(boxedLines.map(line => line.trim().slice(0, 180)), [], 'Typed uniform bindings must not emit dynamic boxing or reflection carriers')
console.log('Actual uniform lookup helpers preserve native named/custom absence and replacement without boxing under ASan/UBSan')
