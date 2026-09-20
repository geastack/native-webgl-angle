import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import plugin from '../geatsc-plugin.mjs'

import { compile } from '@geastack/compiler/dist/compiler.js'
import { createRequire } from 'node:module'

// The same TypeScript the compiler itself uses. This package's own
// devDependency is `latest`, and TypeScript 7 moved the compiler API behind
// ./unstable/*, so a bare `typescript` import resolves to a version stub.
const ts = createRequire(import.meta.resolve('@geastack/compiler/package.json'))('typescript')

const three = fileURLToPath(new URL('./', import.meta.resolve('three/src/constants.js')))
const fileName = resolve(three, 'renderers/webgl/WebGLProgram.js')
const original = readFileSync(fileName, 'utf8')
const transformed = plugin.configure().hostShims.transformSource({ fileName, text: original })
const parse = (text) => ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const functions = new Set([
  'generateShadowMapTypeDefine',
  'generateEnvMapTypeDefine',
  'generateEnvMapModeDefine',
  'generateEnvMapBlendingDefine',
  'generateCubeUVSize'
])
const tables = new Set(['shadowMapTypeDefines', 'envMapTypeDefines', 'envMapModeDefines', 'envMapBlendingDefines'])
const upstreamFunctions = new Map(
  parse(original)
    .statements.filter(ts.isFunctionDeclaration)
    .map((node) => [node.name.text, node.getText()])
)
const upstreamTables = new Map(
  parse(original)
    .statements.filter(ts.isVariableStatement)
    .map((node) => [node.declarationList.declarations[0].name.getText(), node.getText()])
)
const parts = []
for (const node of parse(transformed).statements) {
  if (ts.isFunctionDeclaration(node) && functions.has(node.name.text)) {
    assert.equal(node.getText(), upstreamFunctions.get(node.name.text))
    assert.equal(ts.getJSDocParameterTags(node.parameters[0]).length, 0)
    parts.push(node.getText())
  } else if (ts.isVariableStatement(node) && node.declarationList.declarations.some((decl) => tables.has(decl.name.getText()))) {
    assert.equal(node.getText(), upstreamTables.get(node.declarationList.declarations[0].name.getText()))
    assert.equal(ts.getJSDocType(node), undefined)
    for (const declaration of node.declarationList.declarations) {
      assert.equal(ts.getJSDocType(declaration), undefined)
    }
    parts.push(node.getText())
  }
}
assert.equal(parts.length, functions.size + tables.size)
const constants = await import(pathToFileURL(resolve(three, 'constants.js')).href)
const names = [
  'PCFShadowMap',
  'VSMShadowMap',
  'CubeReflectionMapping',
  'CubeRefractionMapping',
  'CubeUVReflectionMapping',
  'MultiplyOperation',
  'MixOperation',
  'AddOperation'
]
const declarations = names.map((name) => `const ${name} = ${JSON.stringify(constants[name])};`).join('\n')
const source = `// @ts-nocheck\n${declarations}\n${parts.join('\n')}\n
/** @param {number} shadowMapType @param {boolean} envMap @param {number} envMapMode @param {number|undefined} combine @param {number|null} envMapCubeUVHeight */
function makeParameters(shadowMapType, envMap, envMapMode, combine, envMapCubeUVHeight) {
  return { shadowMapType, envMap, envMapMode, combine, envMapCubeUVHeight };
}
function inspect(parameters) {
  console.log(generateShadowMapTypeDefine(parameters));
  console.log(generateEnvMapTypeDefine(parameters));
  console.log(generateEnvMapModeDefine(parameters));
  console.log(generateEnvMapBlendingDefine(parameters));
  const size = generateCubeUVSize(parameters);
  console.log(size === null ? 'none' : size.maxMip);
}
inspect(makeParameters(PCFShadowMap, true, CubeReflectionMapping, MultiplyOperation, 256));
inspect(makeParameters(VSMShadowMap, true, CubeRefractionMapping, MixOperation, 512));
inspect(makeParameters(-1, false, CubeUVReflectionMapping, AddOperation, null));
inspect(makeParameters(-1, true, -1, undefined, null));
`
const entry = resolve(import.meta.dirname, 'shader-parameter-inference.js')
const result = compile({
  rootFileNames: [entry],
  projectFileName: null,
  javaScriptSources: true,
  sourceOverlay: new Map([[entry, source]])
})
assert.ok(
  result.certificate,
  JSON.stringify({
    diagnostics: result.diagnostics,
    refusals: result.refusals
  })
)
assert.deepEqual(result.loweringBlockers, [])
assert.deepEqual(result.emissionRefusals, [])
assert.deepEqual(result.slotDrift, [])
assert.ok(result.source)
const code = result.source.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, ' ')
const dynamicSites = code
  .split('\n')
  .filter((line) => /\bValue\s*::\s*box\w*\s*(?:<|\()|\bunbox\w*\s*(?:<|\()|\bgea\s*::\s*Value\b|\bgea_cpp_value\b/.test(line))
const binary = resolve(compiler, 'measurements/shader-parameter-inference')
execFileSync(
  'clang++',
  [
    '-std=c++20',
    '-O1',
    '-fsanitize=address,undefined',
    `-I${resolve(compiler, 'src/targets/cpp/runtime')}`,
    '-x',
    'c++',
    '-',
    '-o',
    binary
  ],
  {
    input: `${result.source}\nint main() { __gea_top_level(); }\n`,
    env: { ...process.env, TMPDIR: resolve(compiler, 'measurements') }
  }
)
assert.equal(
  execFileSync(binary, { encoding: 'utf8' }),
  execFileSync(process.execPath, ['--input-type=module'], {
    input: source,
    encoding: 'utf8'
  })
)
console.log('PASS original shader helpers and lookup tables match upstream; native behavior matches Node under ASan/UBSan')
assert.equal(dynamicSites.length, 0, 'typed shader lookup tables still emit boxing, unboxing or dynamic carriers')
console.log('PASS original shader helpers emit zero dynamic carriers')
