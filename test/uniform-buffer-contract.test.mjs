import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path, { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executableSuffix, nativeTestOutDir } from './out-dir.mjs'
const runtimeInclude = dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/src/targets/cpp/runtime/gea_runtime_builtins.cpp')))
const packageDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
process.env.GEATSC2_WEBGL_PLUGIN = path.join(packageDir, 'geatsc-plugin.mjs')
const { compile } = await import('@geastack/compiler/dist/compiler.js')

// three's WebGLUniformsGroups binds each uniform block to a binding point and
// a buffer to that point. The facade forwards the four WebGL2 calls to the
// host with the GL names its handles carry, and a null buffer unbinds.
// The `Object.assign` beside them pins that the new host calls leave the
// program's intrinsic trust intact: each declaration states its inert contract.
const entry = path.join(packageDir, 'test', 'uniform-buffer-entry.js')
const source = `
import { NativeWebGL2RenderingContext } from '../src/nativeWebGL.js'
const gl = new NativeWebGL2RenderingContext(() => 640, () => 480)
const program = gl.createProgram()
const buffer = gl.createBuffer()
if (program === null || buffer === null) throw new Error('no handles')
const block = gl.getUniformBlockIndex(program, 'Lights')
gl.uniformBlockBinding(program, block, 2)
gl.bindBufferBase(gl.UNIFORM_BUFFER, 2, buffer)
gl.bindBufferRange(gl.UNIFORM_BUFFER, 3, buffer, 256, 64)
gl.bindBufferBase(gl.UNIFORM_BUFFER, 2, null)
console.log(gl.getUniformBlockIndex(program, 'Missing'))
const merged = Object.assign({}, { binding: 2 })
console.log(merged.binding)
`
const result = compile({ rootFileNames: [entry], projectFileName: null, sourceOverlay: new Map([[entry, source]]) })
assert.ok(result.certificate && result.source, JSON.stringify({ diagnostics: result.diagnostics.diagnostics, refusals: result.refusals }, null, 2))
assert.deepEqual(result.emissionRefusals, [])

const binary = join(nativeTestOutDir(), `uniform-buffer-contract-test${executableSuffix}`)
execFileSync(process.env.CXX ?? 'clang++', ['-std=c++20', '-O1', '-fsanitize=address,undefined', `-I${runtimeInclude}`, '-x', 'c++', '-', '-o', binary], {
  input: `${result.source}
#include <cstdio>
extern "C" double gea_three_webgl_create_program() { return 5; }
extern "C" double gea_three_webgl_create_buffer() { return 7; }
extern "C" double gea_three_webgl_get_uniform_block_index(double program, std::string name) {
  std::printf("getUniformBlockIndex %g %s\\n", program, name.c_str());
  return name == "Lights" ? 1 : 4294967295.0;
}
extern "C" void gea_three_webgl_uniform_block_binding(double program, double block, double binding) {
  std::printf("uniformBlockBinding %g %g %g\\n", program, block, binding);
}
extern "C" void gea_three_webgl_bind_buffer_base(double target, double index, double buffer) {
  std::printf("bindBufferBase %g %g %g\\n", target, index, buffer);
}
extern "C" void gea_three_webgl_bind_buffer_range(double target, double index, double buffer, double offset, double size) {
  std::printf("bindBufferRange %g %g %g %g %g\\n", target, index, buffer, offset, size);
}
int main() { std::setvbuf(stdout, nullptr, _IONBF, 0); __gea_top_level(); }
`,
  env: { ...process.env, TMPDIR: nativeTestOutDir() },
  stdio: ['pipe', 'inherit', 'inherit'],
})
// Windows opens a C++ program's stdout in text mode: `\n` arrives as `\r\n`.
assert.equal(
  execFileSync(binary, { encoding: 'utf8' }).replaceAll('\r\n', '\n'),
  [
    'getUniformBlockIndex 5 Lights',
    'uniformBlockBinding 5 1 2',
    'bindBufferBase 35345 2 7',
    'bindBufferRange 35345 3 7 256 64',
    'bindBufferBase 35345 2 0',
    'getUniformBlockIndex 5 Missing',
    '4294967295',
    '2',
    ''
  ].join('\n')
)
console.log('Uniform block and indexed buffer binds reach the host under ASan/UBSan')
