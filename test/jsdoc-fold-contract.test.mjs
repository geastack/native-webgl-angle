import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import plugin, { foldAdjacentJSDocBlocks } from '../geatsc-plugin.mjs'
import { createRequire } from 'node:module'

// The same TypeScript the compiler itself uses. This package's own
// devDependency is `latest`, and TypeScript 7 moved the compiler API behind
// ./unstable/*, so a bare `typescript` import resolves to a version stub.
const ts = createRequire(import.meta.resolve('@geastack/compiler/package.json'))('typescript')

// TypeScript reads `@param` tags from only the LAST JSDoc block above a
// declaration. The declaration overlay writes its block before this plugin
// runs, so every one-line block the plugin inserts beneath it must fold into
// that block rather than hide it.
const packageDir = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))

const rendererPath = fileURLToPath(import.meta.resolve('three/src/renderers/WebGLRenderer.js'))
assert.ok(fs.existsSync(rendererPath), 'Install the Examples workspace dependencies before running this test')
const { transformSource } = plugin.configure().hostShims

const statement = 'this.renderBufferDirect = function ( camera, scene, geometry, material, object, group ) {'
const pluginBlock = '/** @param {Object3D|null} scene @param {?{ start: number, count: number, materialIndex: (number|undefined) }} group */'
// The overlay's own shape: a multi-line block inserted at the statement's
// start, after its existing indentation (`declaration-overlay-transform.ts`).
const overlayBlock = [
  '/**',
  "\t\t * @param {import('./cameras/Camera.js').Camera} camera",
  "\t\t * @param {import('./scenes/Scene.js').Scene} scene",
  "\t\t * @param {import('./core/BufferGeometry.js').BufferGeometry} geometry",
  "\t\t * @param {import('./materials/Material.js').Material} material",
  "\t\t * @param {import('./core/Object3D.js').Object3D} object",
  "\t\t * @param {import('./objects/Group.js').GeometryGroup} group",
  '\t\t */',
  '\t\t',
].join('\n')

const renderBufferDirectOf = (text) => {
  const file = ts.createSourceFile(rendererPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  let found = null
  const visit = (node) => {
    if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.left) &&
      node.expression.left.name.text === 'renderBufferDirect' &&
      ts.isFunctionExpression(node.expression.right)
    )
      found = node
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.ok(found, 'renderBufferDirect statement')
  return found
}

test('the plugin folds its renderBufferDirect tags into the overlay block above it', () => {
  const upstream = fs.readFileSync(rendererPath, 'utf8')
  assert.ok(upstream.includes(statement))
  const transformed = transformSource({ fileName: rendererPath, text: upstream.replace(statement, `${overlayBlock}${statement}`) })
  assert.equal(typeof transformed, 'string')
  const node = renderBufferDirectOf(transformed)
  const blocks = (ts.getLeadingCommentRanges(transformed, node.pos) ?? []).filter((range) => transformed.startsWith('/**', range.pos))
  assert.equal(blocks.length, 1, 'one JSDoc block above renderBufferDirect')
  const expected = {
    camera: "import('./cameras/Camera.js').Camera",
    scene: 'Object3D|null',
    geometry: "import('./core/BufferGeometry.js').BufferGeometry",
    material: "import('./materials/Material.js').Material",
    object: "import('./core/Object3D.js').Object3D",
    group: '?{ start: number, count: number, materialIndex: (number|undefined) }',
  }
  const parameters = node.expression.right.parameters
  assert.deepEqual(parameters.map((parameter) => parameter.name.text), Object.keys(expected))
  for (const parameter of parameters) {
    const tags = ts.getJSDocParameterTags(parameter)
    assert.equal(tags.length, 1, parameter.name.text)
    assert.equal(tags[0].typeExpression.type.getText(), expected[parameter.name.text], parameter.name.text)
  }
  // Folding the output again, or re-inserting the same block and folding it,
  // leaves the text exactly as it is.
  assert.equal(foldAdjacentJSDocBlocks(transformed), transformed)
  assert.equal(foldAdjacentJSDocBlocks(transformed.replace(statement, `${pluginBlock}\n\t\t${statement}`)), transformed)
})

test('a folded tag replaces only its own head and new tags join their kind', () => {
  const upper = [
    '/**',
    ' * Doc.',
    ' *',
    ' * @param {A} a - first',
    ' * @param {number} [array=[]] - arr',
    ' * @return {X} r',
    ' */',
  ].join('\n')
  const folded = foldAdjacentJSDocBlocks(`${upper}\n/** @param {import('@x/y').Z} a @param {C} c */\nfunction f( a, array, c ) {}`)
  assert.equal(
    folded,
    [
      '/**',
      ' * Doc.',
      ' *',
      " * @param {import('@x/y').Z} a - first",
      ' * @param {number} [array=[]] - arr',
      ' * @param {C} c',
      ' * @return {X} r',
      ' */',
      'function f( a, array, c ) {}',
    ].join('\n'),
  )
  assert.equal(foldAdjacentJSDocBlocks(folded), folded)
  assert.equal(foldAdjacentJSDocBlocks(folded.replace('function', "/** @param {import('@x/y').Z} a @param {C} c */\nfunction")), folded)
})

test('one-line blocks fold inline, @type replaces @type, and separated blocks stay apart', () => {
  assert.equal(
    foldAdjacentJSDocBlocks('/** @param {A} a */\n/** @param {B} b */\nfunction f( a, b ) {}'),
    '/** @param {A} a @param {B} b */\nfunction f( a, b ) {}',
  )
  assert.equal(
    foldAdjacentJSDocBlocks('/**\n * @private\n * @type {Function|null}\n */\n/** @type {null | ((type: string) => void)} */\nlet f = null;'),
    '/**\n * @private\n * @type {null | ((type: string) => void)}\n */\nlet f = null;',
  )
  const apart = '/** @param {A} a */\nfunction f( a ) {}\n/** @param {B} b */\nfunction g( b ) {}'
  assert.equal(foldAdjacentJSDocBlocks(apart), apart)
})

test('declaration blocks never fold, but the blocks beneath them still do', () => {
  const typedefs = '/** @typedef {{ a: number }} First */\n/** @typedef {{ b: number }} Second */\nfunction f() {}'
  assert.equal(foldAdjacentJSDocBlocks(typedefs), typedefs)
  assert.equal(
    foldAdjacentJSDocBlocks('/** @typedef {{ a: number }} First */\n/** @param {A} a */\n/** @param {B} b */\nfunction f( a, b ) {}'),
    '/** @typedef {{ a: number }} First */\n/** @param {A} a @param {B} b */\nfunction f( a, b ) {}',
  )
  const generic = '/** @param {T} a */\n/** @template T */\nfunction f( a ) {}'
  assert.equal(foldAdjacentJSDocBlocks(generic), generic)
})

// WebGLRenderer.render renders any Object3D: a post pass renders its bare
// quad Mesh. The renderer hands that root to each input below, and the
// compiler converts an Object3D entering a Scene-typed input with a checked
// downcast, which throws for the Mesh. Each input therefore states Object3D,
// after the declaration overlay (which lifts `scene: Scene` from @types/three)
// has written its block too.
test('the renderer hands its Object3D root only to Object3D inputs', async () => {
  const { declarationOverlayTransform } = await import('@geastack/compiler/dist/semantics/declaration-overlay-transform.js')
  const object3D = "import('../../core/Object3D.js').Object3D"
  const sites = [
    ['webgl/WebGLRenderLists.js', 'get', 'scene', object3D],
    ['webgl/WebGLRenderStates.js', 'get', 'scene', object3D],
    ['webgl/WebGLBackground.js', 'getBackground', 'scene', object3D],
    ['webgl/WebGLBackground.js', 'render', 'scene', object3D],
    ['webgl/WebGLBackground.js', 'addToRenderList', 'scene', object3D],
    ['webgl/WebGLShadowMap.js', 'render', 'scene', object3D],
    ['WebGLRenderer.js', 'compile', 'targetScene', '?Object3D'],
  ]
  const transformed = new Map()
  for (const [file, name, parameterName, expected] of sites) {
    const fileName = path.join(path.dirname(rendererPath), file)
    if (!transformed.has(file)) {
      const text = fs.readFileSync(fileName, 'utf8')
      const overlaid = declarationOverlayTransform({ fileName, text }) ?? text
      transformed.set(file, transformSource({ fileName, text: overlaid }) ?? overlaid)
    }
    const source = ts.createSourceFile(fileName, transformed.get(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const functions = []
    const visit = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) functions.push(node)
      if (
        ts.isBinaryExpression(node) &&
        ts.isPropertyAccessExpression(node.left) &&
        node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
        node.left.name.text === name &&
        ts.isFunctionExpression(node.right)
      )
        functions.push(node.right)
      ts.forEachChild(node, visit)
    }
    visit(source)
    assert.equal(functions.length, 1, `${file} ${name}`)
    const parameter = functions[0].parameters.find((candidate) => candidate.name.text === parameterName)
    assert.equal(ts.getJSDocType(parameter)?.getText(), expected, `${file} ${name} ${parameterName}`)
  }
  // Only a Scene has a background; each read names the Scene it reads.
  assert.doesNotMatch(transformed.get('webgl/WebGLBackground.js'), /\bscene\.background/)
})
