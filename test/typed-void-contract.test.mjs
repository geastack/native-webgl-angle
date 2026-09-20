import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path, { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import plugin from '../geatsc-plugin.mjs'
import { nativeTestOutDir } from './out-dir.mjs'
import { createRequire } from 'node:module'
import { compile } from '@geastack/compiler/dist/compiler.js'
const runtimeInclude = dirname(fileURLToPath(import.meta.resolve('@geastack/compiler/src/targets/cpp/runtime/gea_runtime_builtins.cpp')))

// The same TypeScript the compiler itself uses. This package's own
// devDependency is `latest`, and TypeScript 7 moved the compiler API behind
// ./unstable/*, so a bare `typescript` import resolves to a version stub.
const ts = createRequire(import.meta.resolve('@geastack/compiler/package.json'))('typescript')

const packageDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

// Pin the package under test before the compiler loads its host capabilities.
process.env.GEATSC2_WEBGL_PLUGIN = path.join(packageDir, 'geatsc-plugin.mjs')

const upstreamPath = fileURLToPath(import.meta.resolve('three/src/renderers/webgl/WebGLBindingStates.js'))
assert.ok(fs.existsSync(upstreamPath), 'Install the Examples workspace dependencies before running this test')
const upstream = fs.readFileSync(upstreamPath, 'utf8')
const definitions = plugin.configure().hostShims
assert.equal(definitions.embeddedHostFunctions.threeWebGLBindVertexArray, 'gea_three_webgl_bind_vertex_array')
assert.ok(definitions.hostExternDeclarations.gea_three_webgl_bind_vertex_array.includes(
  'extern "C" void gea_three_webgl_bind_vertex_array(double vertexArray);',
))
const transformed = definitions.transformSource({ fileName: upstreamPath, text: upstream })
assert.equal(typeof transformed, 'string')

// Compile the actual nested wrapper, extracted without rewriting its body.
// Isolating this call avoids pulling the entire renderer into a void-ABI test;
// the context class and its host bridge are imported from their real sources.
function bindingWrapper(text) {
  const file = ts.createSourceFile(upstreamPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const matches = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'bindVertexArrayObject') matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.equal(matches.length, 1, 'Three.js must contain exactly one bindVertexArrayObject wrapper')
  return matches[0].getText(file)
}

const binary = join(nativeTestOutDir(), 'typed-void-contract-test')
for (const [label, text] of [['upstream', upstream], ['plugin-transformed', transformed]]) {
  const wrapper = bindingWrapper(text)
  assert.match(wrapper, /gl\.bindVertexArray\( vao \);/)
  if (label === 'upstream') assert.match(wrapper, /return gl\.bindVertexArray/)
  const entry = path.join(packageDir, 'test', 'typed-void-entry.js')
  const source = `
import { NativeWebGL2RenderingContext } from '../src/nativeWebGL.js'
const gl = new NativeWebGL2RenderingContext(() => 640, () => 480)
/** @param {Parameters<NativeWebGL2RenderingContext['bindVertexArray']>[0]} vao */
${wrapper}
console.log(bindVertexArrayObject(null) === undefined)
console.log(bindVertexArrayObject(gl.createVertexArray()) === undefined)
console.log(bindVertexArrayObject(null) === undefined)
`
  const result = compile({
    rootFileNames: [entry],
    projectFileName: null,
    sourceOverlay: new Map([[entry, source]]),
    includeIr: true,
  })
  const failures = JSON.stringify({ diagnostics: result.diagnostics.diagnostics, refusals: result.refusals }, null, 2)
  assert.ok(result.certificate, failures)
  assert.deepEqual(result.loweringBlockers, [])
  assert.deepEqual(result.emissionRefusals, [])
  assert.ok(result.source, failures)

  const bodies = new Map(result.irBodies.map(body => [body.functionName, body]))
  const calls = body => [...body.blocks.values()].flatMap(block => block.operations).filter(op => op.kind === 'call')
  for (const name of ['bindVertexArrayObject', 'bindVertexArray', 'nativeWebGLBindVertexArray']) {
    const body = bodies.get(name)
    assert.ok(body, `${label}: missing ${name} from certified IR`)
    assert.equal(result.projection.abis.get(body.sourceOwner)?.result.kind, 'void', `${name} must have a physical void result`)
  }
  for (const [caller, callee] of [['bindVertexArrayObject', 'bindVertexArray'], ['bindVertexArray', 'nativeWebGLBindVertexArray']]) {
    const direct = calls(bodies.get(caller)).filter(call => call.target?.kind === 'direct' && call.target.functionId === bodies.get(callee).sourceOwner)
    assert.equal(direct.length, 1, `${caller} must directly call ${callee}`)
    assert.equal(direct[0].result, null, `${caller} must not manufacture a boxed result`)
  }
  const hostCalls = calls(bodies.get('nativeWebGLBindVertexArray'))
  assert.equal(hostCalls.length, 1)
  assert.equal(hostCalls[0].callee.representation.abi.result.kind, 'void')
  assert.equal(hostCalls[0].result, null)

  // Ignore comments and embedded source strings when checking executable boxing.
  const code = result.source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, ' ')
  assert.match(code, /^gea_three_webgl_bind_vertex_array\([^;]+\);$/m)
  assert.doesNotMatch(code, /\bgea_cpp_value\b|\bgea\s*::\s*Value\b|\bgea_cpp_invoke_method\b/)

  // Only the external GL boundary is mocked. Execute the emitted facade and
  // wrapper to verify nullable handles, call order, and observable undefined.
  execFileSync(process.env.CXX ?? 'clang++', [
    '-std=c++20', '-O1', '-fsanitize=address,undefined',
    `-I${runtimeInclude}`,
    '-x', 'c++', '-', '-o', binary,
  ], {
    input: `${result.source}
#include <cassert>
static int bindCount = 0;
extern "C" double gea_three_webgl_create_vertex_array() { return 41; }
extern "C" void gea_three_webgl_bind_vertex_array(double handle) {
  const double expected[] = {0, 41, 0};
  assert(bindCount < 3 && handle == expected[bindCount]);
  ++bindCount;
}
int main() { __gea_top_level(); assert(bindCount == 3); }
`,
    env: { ...process.env, TMPDIR: nativeTestOutDir() },
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  assert.equal(execFileSync(binary, { encoding: 'utf8' }), 'true\ntrue\ntrue\n')
  console.log(`${label}: direct native void calls, no boxing, nullable handles and undefined verified with ASan/UBSan`)
}
