import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin from '../geatsc-plugin.mjs'
import { createRequire } from 'node:module'

// The same TypeScript the compiler itself uses. This package's own
// devDependency is `latest`, and TypeScript 7 moved the compiler API behind
// ./unstable/*, so a bare `typescript` import resolves to a version stub.
const ts = createRequire(import.meta.resolve('@geastack/compiler/package.json'))('typescript')

const packageDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const repoRoot = path.dirname(packageDir)
const threeSrc = fileURLToPath(new URL('./', import.meta.resolve('three/src/constants.js')))
const webGLTexturesPath = path.join(
  repoRoot,
  'examples',
  'node_modules',
  'three',
  'src',
  'renderers',
  'webgl',
  'WebGLTextures.js',
)
const webGLUniformsPath = path.join(
  repoRoot,
  'examples',
  'node_modules',
  'three',
  'src',
  'renderers',
  'webgl',
  'WebGLUniforms.js',
)
const webGLProgramPath = path.join(
  repoRoot,
  'examples',
  'node_modules',
  'three',
  'src',
  'renderers',
  'webgl',
  'WebGLProgram.js',
)
const webGLAttributesPath = path.join(
  repoRoot,
  'examples',
  'node_modules',
  'three',
  'src',
  'renderers',
  'webgl',
  'WebGLAttributes.js',
)
const webGLRendererPath = path.join(repoRoot, 'examples', 'node_modules', 'three', 'src', 'renderers', 'WebGLRenderer.js')
const webGLRenderTargetPath = path.join(
  repoRoot,
  'examples',
  'node_modules',
  'three',
  'src',
  'renderers',
  'WebGLRenderTarget.js',
)
const webGLShadowMapPath = path.join(
  repoRoot,
  'examples',
  'node_modules',
  'three',
  'src',
  'renderers',
  'webgl',
  'WebGLShadowMap.js',
)
const nativeWebGLPath = path.join(packageDir, 'src', 'nativeWebGL.ts')

assert.ok(fs.existsSync(webGLTexturesPath), 'install the Examples workspace dependencies before running this test')

const transformSource = plugin.configure().hostShims.transformSource
// EventDispatcher supplies a receiver and discards callback results. Preserve
// that actual ABI when replacing its listener dictionary with native storage.
const eventDispatcherPath = path.join(repoRoot, 'examples', 'node_modules', 'three', 'src', 'core', 'EventDispatcher.js')
const eventDispatcherSource = fs.readFileSync(eventDispatcherPath, 'utf8')
const nativeEventDispatcher = transformSource({ fileName: eventDispatcherPath, text: eventDispatcherSource })
assert.ok(nativeEventDispatcher.includes('@typedef {(this: EventDispatcher, event: NativeEvent) => void} NativeEventListener'))
assert.ok(nativeEventDispatcher.includes('array[ i ].call( this, event );'))
for (const source of [eventDispatcherSource, nativeEventDispatcher]) {
  const Dispatcher = new Function(`${source.replace('export { EventDispatcher };', '')}; return EventDispatcher;`)()
  const dispatcher = new Dispatcher()
  const observed = []
  function second(event) { observed.push([this, event.target, 'second']) }
  function first(event) {
    observed.push([this, event.target, 'first'])
    dispatcher.removeEventListener('dispose', second)
    return { ignored: true }
  }
  dispatcher.addEventListener('dispose', first)
  dispatcher.addEventListener('dispose', second)
  dispatcher.addEventListener('dispose', first)
  const event = { type: 'dispose' }
  assert.equal(dispatcher.dispatchEvent(event), undefined)
  assert.deepEqual(observed, [[dispatcher, dispatcher, 'first'], [dispatcher, dispatcher, 'second']])
  assert.equal(event.target, null)
  assert.equal(dispatcher.hasEventListener('dispose', second), false)
  assert.equal(dispatcher.hasEventListener('dispose', first), true)
}

// Three's renderer stores `materialNeedsLights( material )` into the property
// bag's `needsLights`, and that flag chain is `undefined` for every material
// without lights (`MeshBasicMaterial`). The declared slot has to admit it, or
// it lays out as a bare native boolean and the first frame throws storing it.
const webGLPropertiesPath = path.join(repoRoot, 'examples', 'node_modules', 'three', 'src', 'renderers', 'webgl', 'WebGLProperties.js')
const nativeWebGLProperties = transformSource({ fileName: webGLPropertiesPath, text: fs.readFileSync(webGLPropertiesPath, 'utf8') })
assert.match(nativeWebGLProperties, /\/\*\* @type \{boolean\|undefined\} \*\/\s*this\.needsLights = undefined;/)
// `getParameters` stores `shaderIDs[ material.type ]` as `parameters.shaderID`,
// and every `ShaderMaterial` misses that table, so the lookup must state the
// `undefined` it yields there.
const webGLProgramsPath = path.join(repoRoot, 'examples', 'node_modules', 'three', 'src', 'renderers', 'webgl', 'WebGLPrograms.js')
const nativeWebGLPrograms = transformSource({ fileName: webGLProgramsPath, text: fs.readFileSync(webGLProgramsPath, 'utf8') })
assert.doesNotMatch(nativeWebGLPrograms, /const shaderID = shaderIDs\[ material\.type \];/)
assert.match(nativeWebGLPrograms, /const shaderID = \/\*\* @type \{string\|undefined\} \*\/ \( shaderIDs\[ material\.type \] \);/)
// `setMaterial` hands `setBlending` the material's alpha blend factors, which
// `Material` initializes to `null`.
const webGLStatePath = path.join(threeSrc, 'renderers', 'webgl', 'WebGLState.js')
const nativeWebGLState = transformSource({ fileName: webGLStatePath, text: fs.readFileSync(webGLStatePath, 'utf8') })

const stateSyntax = ts.createSourceFile(webGLStatePath, nativeWebGLState, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
for (const method of ['texStorage2D', 'texStorage3D']) {
  let declaration
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === method) declaration = node
    ts.forEachChild(node, visit)
  }
  visit(stateSyntax)
  assert.ok(declaration)
  const calls = []
  const errors = []
  const failure = new Error('native allocation failed')
  const gl = { [method](...args) { if (args[0] === -1) throw failure; calls.push(args) } }
  const forward = new Function('gl', 'error', `${declaration.getText(stateSyntax)}; return ${method};`)(gl, (...args) => errors.push(args))
  assert.equal(forward.length, 0)
  for (const args of [[], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7]]) {
    assert.equal(forward(...args), undefined)
    assert.deepEqual(calls.at(-1), args)
  }
  assert.equal(forward(-1), undefined)
  assert.deepEqual(errors, [['WebGLState:', failure]])
}
const uploadNames = ['compressedTexImage2D', 'compressedTexImage3D', 'texImage2D', 'texImage3D',
  'texSubImage2D', 'texSubImage3D', 'compressedTexSubImage2D', 'compressedTexSubImage3D']
const uploadDeclarations = []
const collectUpload = (node) => {
  if (ts.isFunctionDeclaration(node) && (uploadNames.includes(node.name?.text) || node.name?.text.startsWith('requireWebGLState')))
    uploadDeclarations.push(node.getText(stateSyntax))
  ts.forEachChild(node, collectUpload)
}
collectUpload(stateSyntax)
const uploadCalls = []
const uploadErrors = []
const uploadContext = Object.fromEntries(uploadNames.map(name => [name, (...args) => uploadCalls.push({ name, args })]))
const uploads = new Function('gl', 'error', `${uploadDeclarations.join('\n')}; return {${uploadNames.join(',')}};`)(
  uploadContext, (...args) => uploadErrors.push(args))
const pixels = new Uint8Array([1, 2, 3, 4])
for (const [name, args] of [
  ['compressedTexImage2D', [1, 2, 3, 4, 5, 0, pixels]],
  ['compressedTexImage3D', [1, 2, 3, 4, 5, 6, 0, pixels, 0, 0]],
  ['texImage2D', [1, 2, 3, 4, 5, 0, 6, 7, pixels]],
  ['texImage3D', [1, 2, 3, 4, 5, 6, 0, 7, 8, pixels]],
  ['texSubImage2D', [1, 2, 3, 4, 5, 6, 7, 8, pixels]],
  ['texSubImage3D', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, pixels]],
  ['compressedTexSubImage2D', [1, 2, 3, 4, 5, 6, 7, pixels]],
  ['compressedTexSubImage3D', [1, 2, 3, 4, 5, 6, 7, 8, 9, pixels]],
]) {
  assert.equal(uploads[name].length, 0)
  uploads[name](...args)
  assert.deepEqual(uploadCalls.at(-1), { name, args })
}
uploads.texImage2D(1, 2, 3, 4, 5, { width: 6, height: 7, data: pixels })
assert.deepEqual(uploadCalls.at(-1), { name: 'texImage2D', args: [1, 2, 3, 6, 7, 0, 4, 5, pixels] })
uploads.texSubImage2D(1, 2, 3, 4, 5, 6, { width: 7, height: 8, data: pixels })
assert.deepEqual(uploadCalls.at(-1), { name: 'texSubImage2D', args: [1, 2, 3, 4, 7, 8, 5, 6, pixels] })
assert.deepEqual(uploadErrors, [])
for (const factor of ['blendEquationAlpha', 'blendSrcAlpha', 'blendDstAlpha'])
  assert.match(nativeWebGLState, new RegExp(`@param \\{number\\|null=\\} ${factor} `))
const interleavedPath = path.join(threeSrc, 'core/InterleavedBuffer.js')
const interleavedSource = transformSource({ fileName: interleavedPath, text: fs.readFileSync(interleavedPath, 'utf8') })
const interleavedSyntax = ts.createSourceFile(interleavedPath, interleavedSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const interleavedDeclarations = interleavedSyntax.statements.filter(node =>
  (ts.isClassDeclaration(node) && node.name?.text === 'InterleavedBuffer') ||
  (ts.isFunctionDeclaration(node) && node.name?.text === 'createTypedArrayFromBuffer'))
assert.equal(interleavedDeclarations.length, 2)
let nextBufferId = 0
const InterleavedBuffer = new Function('generateUUID', 'StaticDrawUsage',
  `${interleavedDeclarations.map(node => node.getText(interleavedSyntax)).join('\n')}; return InterleavedBuffer;`)(
    () => `buffer-${nextBufferId++}`, 35044)
const originalData = new Float32Array([1, 2, 3, 4])
const leftBuffer = new InterleavedBuffer(originalData, 2)
const rightBuffer = new InterleavedBuffer(originalData, 2)
const cloneCache = {}
const leftClone = leftBuffer.clone(cloneCache)
const rightClone = rightBuffer.clone(cloneCache)
assert.notEqual(leftClone.array.buffer, originalData.buffer)
assert.equal(leftClone.array.buffer, rightClone.array.buffer)
leftClone.array[0] = 9
assert.equal(rightClone.array[0], 9)
assert.equal(originalData[0], 1)
const upstreamWebGLTextures = fs.readFileSync(webGLTexturesPath, 'utf8')
const nativeWebGLTextures = transformSource({ fileName: webGLTexturesPath, text: upstreamWebGLTextures })

assert.equal(typeof nativeWebGLTextures, 'string')
assert.doesNotMatch(nativeWebGLTextures, /typeof OffscreenCanvas|new OffscreenCanvas/)
assert.doesNotMatch(nativeWebGLTextures, /useOffscreenCanvas\s*=/)
assert.match(nativeWebGLTextures, /const supportsInvalidateFramebuffer = false;/)
assert.doesNotMatch(nativeWebGLTextures, /typeof navigator|navigator\.userAgent/)
const createCanvasStart = nativeWebGLTextures.indexOf('function createCanvas( width, height ) {')
const createCanvasEnd = nativeWebGLTextures.indexOf('function resizeImage(', createCanvasStart)
assert.ok(createCanvasStart >= 0 && createCanvasEnd > createCanvasStart)
const createCanvasSource = nativeWebGLTextures.slice(createCanvasStart, createCanvasEnd)
assert.match(createCanvasSource, /return createElementNS\( 'canvas' \);/)
assert.doesNotMatch(createCanvasSource, /\?/)
const requireImageStart = nativeWebGLTextures.indexOf('function requireTextureImageRecord( value ) {')
const requireImageEnd = nativeWebGLTextures.indexOf('function requireTextureImageRecords( value ) {', requireImageStart)
assert.ok(requireImageStart >= 0 && requireImageEnd > requireImageStart)
const requireImageSource = nativeWebGLTextures.slice(requireImageStart, requireImageEnd)
assert.match(requireImageSource, /return \{\s+data: value\.data,\s+width: value\.width,\s+height: value\.height,/)
assert.match(requireImageSource, /complete: 'complete' in value \? value\.complete : undefined/)
assert.doesNotMatch(requireImageSource, /return value;/)

const upstreamWebGLUniforms = fs.readFileSync(webGLUniformsPath, 'utf8')
const nativeWebGLUniforms = transformSource({ fileName: webGLUniformsPath, text: upstreamWebGLUniforms })
assert.match(nativeWebGLUniforms, /function flatten\( array, nBlocks, blockSize \)/)
assert.match(nativeWebGLUniforms, /@return \{NativeFloatUniformArray\}/)
assert.match(nativeWebGLUniforms, /requireFloatUniformArray\( v \)/)
assert.match(nativeWebGLUniforms, /if \( isUniformNumberArray\( array \) \) return array;/)
const flattenStart = nativeWebGLUniforms.indexOf('function flatten( array, nBlocks, blockSize ) {')
const flattenEnd = nativeWebGLUniforms.indexOf('function arraysEqual(', flattenStart)
assert.ok(flattenStart >= 0 && flattenEnd > flattenStart)
const flattenSource = nativeWebGLUniforms.slice(flattenStart, flattenEnd)
assert.match(flattenSource, /copyUniformElement\( array\[ i \], r, offset, blockSize \)/)
const flatten = new Function('isUniformNumberArray', 'arrayCacheF32', 'copyUniformElement', flattenSource + '\nreturn flatten;')(
  value => Array.isArray(value) && value.every(item => typeof item === 'number'),
  {},
  (value, output, offset, blockSize) => {
    for (let i = 0; i < blockSize; ++i) output[offset + i] = value.values[i]
  }
)
const numericUniform = [1, 2, 3]
assert.equal(flatten(numericUniform, 1, 3), numericUniform)
const typedUniform = new Float32Array([4, 5, 6])
assert.equal(flatten(typedUniform, 1, 3), typedUniform)
const packedUniform = flatten([{ values: [1, 2, 3] }, { values: [4, 5, 6] }], 2, 3)
assert.deepEqual([...packedUniform], [1, 2, 3, 4, 5, 6])
assert.equal(flatten([{ values: [6, 5, 4] }, { values: [3, 2, 1] }], 2, 3), packedUniform)
assert.deepEqual([...packedUniform], [6, 5, 4, 3, 2, 1])
assert.doesNotMatch(flattenSource, /\.toArray\(/)
for (const typeName of ['Matrix2', 'Matrix3', 'Matrix4', 'Color', 'Vector2', 'Vector3', 'Vector4']) {
  assert.match(nativeWebGLUniforms, new RegExp(`value instanceof ${typeName}`))
}

const nativeWebGLAttributes = transformSource({
  fileName: webGLAttributesPath,
  text: fs.readFileSync(webGLAttributesPath, 'utf8'),
})
assert.match(nativeWebGLAttributes, /@typedef \{\{[^\n]+size\?: number \}\} NativeAttributeBufferCache/)
assert.equal((nativeWebGLAttributes.match(/WeakMap<BufferAttribute\|InterleavedBuffer\|GLBufferAttribute, NativeAttributeBufferCache>/g) ?? []).length, 2)
assert.match(nativeWebGLAttributes, /@return \{NativeAttributeBufferCache\} \*\/\n\tfunction createBuffer\(/)
const attributeKindStart = nativeWebGLAttributes.indexOf('function getAttributeArrayKind( array ) {')
const attributeKindEnd = nativeWebGLAttributes.indexOf('\n}\n', attributeKindStart)
assert.ok(attributeKindStart >= 0 && attributeKindEnd > attributeKindStart)
const attributeKindSource = nativeWebGLAttributes.slice(attributeKindStart, attributeKindEnd + 2)
const getAttributeArrayKind = Function(`${attributeKindSource}; return getAttributeArrayKind;`)()
assert.equal(getAttributeArrayKind(new Uint16Array([0, 2, 1])), 2)
assert.equal(getAttributeArrayKind(new Uint32Array([0, 2, 1])), 3)
assert.equal(getAttributeArrayKind(new Uint8Array([0, 2, 1])), 4)
assert.equal(getAttributeArrayKind(new Uint8ClampedArray([0, 2, 1])), 4)
assert.equal(getAttributeArrayKind(new Float32Array([0, 2, 1])), 1)
assert.equal(getAttributeArrayKind(new Int8Array([0, 2, 1])), 5)
assert.equal(getAttributeArrayKind(new Int16Array([0, 2, 1])), 6)
assert.equal(getAttributeArrayKind(new Int32Array([0, 2, 1])), 7)
assert.equal(getAttributeArrayKind(new Float64Array([0, 2, 1])), 8)
assert.throws(() => getAttributeArrayKind([0, 2, 1]), /Unsupported typed array/)
assert.match(nativeWebGLAttributes, /gl\.bufferDataWithKind\( bufferType, array, usage, getAttributeArrayKind\( array \) \);/)
assert.match(nativeWebGLAttributes, /gl\.bufferSubDataWithKind\( bufferType, 0, array, getAttributeArrayKind\( array \) \);/)
assert.match(
  nativeWebGLAttributes,
  /gl\.bufferSubDataWithKind\( bufferType, range\.start \* getAttributeArrayBytesPerElement\( array \),\s+array, getAttributeArrayKind\( array \), range\.start, range\.count \);/,
)
const glBufferCacheStart = nativeWebGLAttributes.indexOf('if ( dataAttribute instanceof GLBufferAttribute )')
const glBufferCacheEnd = nativeWebGLAttributes.indexOf('\t\t\treturn;', glBufferCacheStart)
assert.ok(glBufferCacheStart >= 0 && glBufferCacheEnd > glBufferCacheStart)
assert.doesNotMatch(nativeWebGLAttributes.slice(glBufferCacheStart, glBufferCacheEnd), /\bsize:/)

const nativeWebGLRenderer = transformSource({ fileName: webGLRendererPath, text: fs.readFileSync(webGLRendererPath, 'utf8') })
assert.match(nativeWebGLRenderer, /if \( typeof materialIndex !== 'number' \) continue;/)
assert.match(nativeWebGLRenderer, /const singleMaterial = \/\*\* @type \{import\('\.\.\/materials\/Material\.js'\)\.Material\} \*\//)
const setRenderTargetStart = nativeWebGLRenderer.indexOf('this.setRenderTarget = function (')
const setRenderTargetEnd = nativeWebGLRenderer.indexOf('\n\t\t};', setRenderTargetStart)
assert.ok(setRenderTargetStart >= 0 && setRenderTargetEnd > setRenderTargetStart)
assert.equal(
  (nativeWebGLRenderer.slice(setRenderTargetStart, setRenderTargetEnd).match(/const renderTargetProperties =/g) ?? []).length,
  1,
)
assert.match(nativeWebGLRenderer, /@param \{Scene\} scene @param \{import\('\.\.\/materials\/Material\.js'\)\.Material\} material/)
// The compiler now carries NativeUniforms through the ordinary material
// refresh; the old renderer-local common-uniform replacement is gone.
assert.match(nativeWebGLRenderer, /materials\.refreshMaterialUniforms\( m_uniforms, material,/)
const nativeUniformGroupsStart = nativeWebGLRenderer.indexOf('// UBOs')
const nativeUniformGroupsEnd = nativeWebGLRenderer.indexOf('\n\t\t\treturn program;', nativeUniformGroupsStart)
assert.ok(nativeUniformGroupsStart >= 0 && nativeUniformGroupsEnd > nativeUniformGroupsStart)
const nativeUniformGroups = nativeWebGLRenderer.slice(nativeUniformGroupsStart, nativeUniformGroupsEnd)
assert.match(nativeUniformGroups, /if \( material\.isShaderMaterial === true \) \{/)
assert.match(
  nativeUniformGroups,
  /const shaderMaterial = \/\*\* @type \{import\('\.\.\/materials\/ShaderMaterial\.js'\)\.ShaderMaterial\} \*\/ \( material \);/,
)
assert.match(nativeUniformGroups, /const groups = shaderMaterial\.uniformsGroups;/)
assert.doesNotMatch(nativeUniformGroups, /material\.uniformsGroups/)

const webGLMaterialsPath = path.join(path.dirname(webGLRendererPath), 'webgl', 'WebGLMaterials.js')
const nativeWebGLMaterials = transformSource({ fileName: webGLMaterialsPath, text: fs.readFileSync(webGLMaterialsPath, 'utf8') })
assert.match(
  nativeWebGLMaterials,
  /@param \{NativeUniforms\} uniforms @param \{import\('\.\.\/\.\.\/materials\/Material\.js'\)\.Material\} material \*\/\n\tfunction refreshMaterialUniforms/,
)

const nativeWebGLRenderTarget = transformSource({
  fileName: webGLRenderTargetPath,
  text: fs.readFileSync(webGLRenderTargetPath, 'utf8'),
})
assert.doesNotMatch(nativeWebGLRenderTarget, /RenderTarget~Options/)
assert.match(nativeWebGLRenderTarget, /@param \{\{ generateMipmaps\?: boolean,[^\n]+depthTexture\?: import\('\.\.\/textures\/Texture\.js'\)\.Texture\|null,[^\n]+useArrayDepthTexture\?: boolean \}\} \[options\]/)
assert.equal(
  transformSource({ fileName: webGLRenderTargetPath, text: nativeWebGLRenderTarget }),
  null,
  'WebGLRenderTarget option typing must survive source preparation without a second rewrite',
)
const normalizedWebGLRenderTarget = transformSource({
  fileName: webGLRenderTargetPath,
  text: fs.readFileSync(webGLRenderTargetPath, 'utf8').replace('RenderTarget~Options', 'RenderTarget_Options'),
})
assert.match(normalizedWebGLRenderTarget, /depthTexture\?: import\('\.\.\/textures\/Texture\.js'\)\.Texture\|null/)
assert.doesNotMatch(normalizedWebGLRenderTarget, /RenderTarget_Options/)

const nativeWebGLShadowMap = transformSource({ fileName: webGLShadowMapPath, text: fs.readFileSync(webGLShadowMapPath, 'utf8') })
assert.match(nativeWebGLShadowMap, /const customDistanceMaterial =/)
assert.match(nativeWebGLShadowMap, /const customDepthMaterial =/)
assert.match(nativeWebGLShadowMap, /const cachedMaterial = materialsForVariant\[ keyB \];/)
assert.doesNotMatch(nativeWebGLShadowMap, /let result = null|let cachedMaterial =/)
assert.match(nativeWebGLShadowMap, /import \{ Mesh \} from '\.\.\/\.\.\/objects\/Mesh\.js';/)
assert.match(nativeWebGLShadowMap, /import \{ Line \} from '\.\.\/\.\.\/objects\/Line\.js';/)
assert.match(nativeWebGLShadowMap, /import \{ Points \} from '\.\.\/\.\.\/objects\/Points\.js';/)
assert.match(nativeWebGLShadowMap, /@param \{import\('\.\.\/\.\.\/core\/Object3D\.js'\)\.Object3D\} object/)
assert.match(nativeWebGLShadowMap, /object instanceof Mesh \|\| object instanceof Line \|\| object instanceof Points/)
assert.doesNotMatch(nativeWebGLShadowMap, /object\.isMesh \|\| object\.isLine \|\| object\.isPoints/)

const nativeWebGLSource = fs.readFileSync(nativeWebGLPath, 'utf8')
assert.match(
  nativeWebGLSource,
  /bufferDataWithKind\(target: number, data: BufferSourceLike, usage: number, kind: number\): void \{\s+threeWebGLBufferData\(target, usage, kind, data\)/,
)
assert.match(nativeWebGLSource, /bufferSubDataWithKind\([\s\S]+threeWebGLBufferSubDataRange\(target, offset, kind, data, sourceOffset, Math\.max\(0, end - sourceOffset\)\)/)
const typedArrayKindStart = nativeWebGLSource.indexOf('function typedArrayKind(')
const typedArrayKindEnd = nativeWebGLSource.indexOf('function zeroF32Array(', typedArrayKindStart)
assert.ok(typedArrayKindStart >= 0 && typedArrayKindEnd > typedArrayKindStart)
const typedArrayKindSource = nativeWebGLSource.slice(typedArrayKindStart, typedArrayKindEnd)
assert.match(typedArrayKindSource, /if \(value instanceof Uint16Array\) return 2/)
assert.match(typedArrayKindSource, /if \(value instanceof Uint32Array\) return 3/)
assert.match(typedArrayKindSource, /if \(value instanceof Uint8Array \|\| value instanceof Uint8ClampedArray\) return 4/)
assert.doesNotMatch(typedArrayKindSource, /value === null|value === undefined|Array\.isArray\(value\)|if \(!value\)/)

const nativeWebGLProgram = transformSource({ fileName: webGLProgramPath, text: fs.readFileSync(webGLProgramPath, 'utf8') })
const includeResolverStart = nativeWebGLProgram.indexOf('/** @param {string} include @return {string|undefined} */', nativeWebGLProgram.indexOf('// Resolve Includes'))
const includeResolverEnd = nativeWebGLProgram.indexOf('// Unroll Loops', includeResolverStart)
assert.ok(includeResolverStart >= 0 && includeResolverEnd > includeResolverStart)
const includeResolverSource = nativeWebGLProgram.slice(includeResolverStart, includeResolverEnd)
assert.doesNotMatch(includeResolverSource, /includePattern|includeReplacer|\.replace\(/)
assert.match(includeResolverSource, /string\.startsWith\( '#include', position \)/)
assert.match(includeResolverSource, /string\.indexOf\( '\\n', position \)/)
assert.match(includeResolverSource, /return resolveIncludes\( string \);/)
assert.match(includeResolverSource, /getShaderChunkAlias\( include \)/)

const warnings = []
const makeIncludeResolver = (source, chunks) => Function(
  'ShaderChunk',
  'warn',
  `${source}; return resolveIncludes;`,
)(chunks, (...args) => warnings.push(args))
const resolveIncludes = makeIncludeResolver(includeResolverSource, {
  outer: 'outer-start\n#include <inner>\nouter-end',
  inner: 'inner',
  'path/chunk.glsl': 'path-chunk',
})
assert.equal(
  resolveIncludes('before\n \t#include  <outer> tail\n#include\t<inner>\nx #include <inner>\n#include <path/chunk.glsl>\nafter'),
  'before\nouter-start\ninner\nouter-end tail\n#include\t<inner>\nx #include <inner>\npath-chunk\nafter',
)
assert.equal(resolveIncludes('\t#include <inner>\r\n'), 'inner\r\n')
assert.throws(
  () => resolveIncludes('#include <missing>'),
  { name: 'Error', message: 'THREE.WebGLProgram: Can not resolve #include <missing>' },
)

const aliasIncludeResolverSource = includeResolverSource.replace(
  '\treturn undefined;\n\n}',
  "\treturn include === 'legacy' ? 'modern' : undefined;\n\n}",
)
assert.notEqual(aliasIncludeResolverSource, includeResolverSource)
const resolveAliasedIncludes = makeIncludeResolver(aliasIncludeResolverSource, {
  modern: '#include <inner>',
  inner: 'aliased-inner',
})
assert.equal(resolveAliasedIncludes('#include <legacy>'), 'aliased-inner')
assert.deepEqual(warnings, [[
  'WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',
  'legacy',
  'modern',
]])

for (const [label, source] of [
  ['WebGLRenderer', nativeWebGLRenderer],
  ['WebGLAttributes', nativeWebGLAttributes],
  ['WebGLMaterials', nativeWebGLMaterials],
  ['WebGLShadowMap', nativeWebGLShadowMap],
  ['WebGLProgram', nativeWebGLProgram],
]) {
  const syntaxCheck = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' })
  assert.equal(syntaxCheck.status, 0, `${label} native transform must be valid JavaScript:\n${syntaxCheck.stderr}`)
}
