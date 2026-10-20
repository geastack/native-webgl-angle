import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path, { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executableSuffix, nativeTestOutDir } from './out-dir.mjs'
const runtimeInclude = dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/src/targets/cpp/runtime/gea_runtime_builtins.cpp')))
const packageDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
process.env.GEATSC2_WEBGL_PLUGIN = path.join(packageDir, 'geatsc-plugin.mjs')
const { compile } = await import('@geastack/compiler/dist/compiler.js')

// three's WebGLProgram reports a failed compile or link with these logs. The
// facade returns the driver's own log, which only the host can read.
const entry = path.join(packageDir, 'test', 'info-log-entry.js')
const source = `
import { NativeWebGL2RenderingContext } from '../src/nativeWebGL.js'
const gl = new NativeWebGL2RenderingContext(() => 640, () => 480)
const shader = gl.createShader(gl.FRAGMENT_SHADER)
const program = gl.createProgram()
if (shader === null || program === null) throw new Error('no handles')
console.log(gl.getShaderInfoLog(shader))
console.log(gl.getProgramInfoLog(program))
`
const result = compile({ rootFileNames: [entry], projectFileName: null, sourceOverlay: new Map([[entry, source]]) })
assert.ok(result.certificate && result.source, JSON.stringify({ diagnostics: result.diagnostics.diagnostics, refusals: result.refusals }, null, 2))
assert.deepEqual(result.emissionRefusals, [])

const binary = join(nativeTestOutDir(), `info-log-contract-test${executableSuffix}`)
execFileSync(process.env.CXX ?? 'clang++', ['-std=c++20', '-O1', '-fsanitize=address,undefined', `-I${runtimeInclude}`, '-x', 'c++', '-', '-o', binary], {
  input: `${result.source}
extern "C" double gea_three_webgl_create_shader(double) { return 3; }
extern "C" double gea_three_webgl_create_program() { return 5; }
extern "C" std::string gea_three_webgl_get_shader_info_log(double shader) { return shader == 3 ? "ERROR: 0:1: 'x' : undeclared identifier" : "wrong shader"; }
extern "C" std::string gea_three_webgl_get_program_info_log(double program) { return program == 5 ? "link failed" : "wrong program"; }
int main() { __gea_top_level(); }
`,
  env: { ...process.env, TMPDIR: nativeTestOutDir() },
  stdio: ['pipe', 'inherit', 'inherit'],
})
// Windows opens a C++ program's stdout in text mode: `\n` arrives as `\r\n`.
assert.equal(execFileSync(binary, { encoding: 'utf8' }).replaceAll('\r\n', '\n'), "ERROR: 0:1: 'x' : undeclared identifier\nlink failed\n")
console.log('Shader and program info logs reach the facade from the host under ASan/UBSan')
