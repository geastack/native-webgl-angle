import { nativeTypedArrayFactory } from './geatsc-plugin.mjs'

// The native model of three's `BatchedMesh`.
//
// Three's own source leaves this class almost entirely dynamic: `_matricesTexture`
// / `_indirectTexture` start life as `this._x = null;` in the constructor and are
// filled in one statement later by a void-returning `_init*Texture()`, so every
// reader downstream sees a nullable field the checker can never narrow away;
// `_geometryInfo`/`_instanceInfo` are untyped `[]` holding ad-hoc object literals,
// read back and even `...`-spread in `copy()`; `copyArrayContents` distinguishes
// typed-array kinds by comparing `.constructor` identity, which a native typed
// array has no boxed carrier for; and the renderer's own per-frame frustum call
// reads `camera.coordinateSystem`, which three's JSDoc types as `any` because it
// names a value constant as a type. None of that is a genuinely dynamic boundary
// -- it is three's own JS being looser than the shapes it actually builds -- so
// this module states the real shapes once and rewrites every site that read
// through the loose ones, changing no observable behaviour (each deviation from
// a literal transcription is called out in a comment at the site, including one
// real upstream bug fixed in `copy()` -- see the `_colorsTexture` note there).
//
// `transformBatchedMesh` rewrites `objects/BatchedMesh.js` itself.
// `transformBatchedRendererBranch` rewrites the `object.isBatchedMesh` uniform
// branch in `renderers/WebGLRenderer.js`, which is currently stubbed by the base
// plugin (`native-webgl-angle/geatsc-plugin.mjs`) to throw; wiring this in is the
// base plugin's call; this function exists so a probe (or, later, the base
// plugin) can apply the exact same rewrite without duplicating its text.

/**
 * The BatchedMesh module's own typedefs, inserted once near the top of the
 * transformed file, right before `copyArrayContents`. Field names, order and
 * types come straight from the object literals three itself builds in
 * `addGeometry()` (`NativeBatchedGeometryInfo`) and `addInstance()`
 * (`NativeBatchedInstanceInfo`).
 */
const batchedMeshTypedefs = `/**
 * BatchedMesh's per-geometry bookkeeping record -- the literal \`addGeometry()\`
 * builds, stated once so \`_geometryInfo\` is a typed array instead of an
 * \`any[]\` dictionary of ad-hoc object literals.
 * @typedef {{
 *   vertexStart: number, vertexCount: number, reservedVertexCount: number,
 *   indexStart: number, indexCount: number, reservedIndexCount: number,
 *   start: number, count: number,
 *   boundingBox: Box3|null, boundingSphere: Sphere|null,
 *   active: boolean
 * }} NativeBatchedGeometryInfo
 * @typedef {{ visible: boolean, active: boolean, geometryIndex: number }} NativeBatchedInstanceInfo
 * @typedef {{ start: number, count: number, z: number, index: number }} NativeBatchedRenderListItem
 * @typedef {(this: BatchedMesh, list: NativeBatchedRenderListItem[], camera: import('../cameras/Camera.js').Camera) => void} NativeBatchedSort
 */`

/**
 * `copyArrayContents`, `textureImageRecord` and `textureData`: the three
 * module-level helpers this file adds. `copyArrayContents` keeps three's own
 * fast/slow split (same-kind block copy vs per-element copy) but branches on
 * concrete typed-array kind via `instanceof` instead of `.constructor`
 * identity, which a native typed-array value has nothing to carry that as.
 * `textureImageRecord`/`textureData` narrow a DataTexture's `image` -- the
 * base Texture's `NativeTextureSourceData` union (see `Texture.js` in the
 * base plugin) -- to the concrete record/array every BatchedMesh data
 * texture actually holds, replacing ~15 `.image.data` reads/writes that
 * would otherwise each need their own cast.
 */
const batchedMeshHelpers = `${nativeTypedArrayFactory('createBatchedArrayWithLength', 'number')}

/** @param {BufferGeometry} geometry @param {string} name */
function sourceAttribute( geometry, name ) {

\tconst attribute = geometry.getAttribute( name );
\tif ( attribute === undefined ) throw new Error( 'THREE.BatchedMesh: missing geometry attribute.' );
\treturn attribute;

}

/** @param {BufferGeometry} geometry @param {string} name @return {BufferAttribute} */
function batchedAttribute( geometry, name ) {

\tconst attribute = sourceAttribute( geometry, name );
\t// _initializeGeometry always creates plain BufferAttributes for the batch.
\tif ( attribute instanceof BufferAttribute ) return attribute;
\tthrow new Error( 'THREE.BatchedMesh: batch geometry attribute must be a BufferAttribute.' );

}

// safely copies array contents to a potentially smaller array
/**
 * @param {Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array} src
 * @param {Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array} target
 */
function copyArrayContents( src, target ) {

\t// three compared \`src.constructor !== target.constructor\`; a typed native
\t// array carrier has no \`.constructor\` identity to read back here, so branch
\t// on the concrete kind instead -- same fast/slow split, same behaviour.
\tif (
\t\t( src instanceof Int8Array && target instanceof Int8Array ) ||
\t\t( src instanceof Uint8Array && target instanceof Uint8Array ) ||
\t\t( src instanceof Uint8ClampedArray && target instanceof Uint8ClampedArray ) ||
\t\t( src instanceof Int16Array && target instanceof Int16Array ) ||
\t\t( src instanceof Uint16Array && target instanceof Uint16Array ) ||
\t\t( src instanceof Int32Array && target instanceof Int32Array ) ||
\t\t( src instanceof Uint32Array && target instanceof Uint32Array ) ||
\t\t( src instanceof Float32Array && target instanceof Float32Array ) ||
\t\t( src instanceof Float64Array && target instanceof Float64Array )
\t) {

\t\t// if the arrays use the same data layout we can use a fast block copy.
\t\t// Every caller in this file passes a freshly allocated, zero-offset
\t\t// typed array, so a same-kind subarray view is exactly the buffer slice
\t\t// three's \`new src.constructor( src.buffer, 0, len )\` produced.
\t\tconst len = Math.min( src.length, target.length );
\t\ttarget.set( src.subarray( 0, len ) );

\t} else {

\t\t// if arrays are of a different type (eg due to index size increasing) then data must be per-element copied
\t\tconst len = Math.min( src.length, target.length );
\t\tfor ( let i = 0; i < len; i ++ ) {

\t\t\ttarget[ i ] = src[ i ];

\t\t}

\t}

}

/**
 * Narrows a DataTexture's \`image\` (the base Texture's \`NativeTextureSourceData\`
 * union) to the concrete \`{ data, width, height }\` record every BatchedMesh
 * data texture actually holds, so callers can read AND replace \`data\`
 * without re-deriving the narrowing at every access.
 *
 * No \`@return\` annotation: a JSDoc \`@typedef\` (\`NativeTextureImage\`, declared
 * in \`Texture.js\`) does not resolve when named through \`import('./Texture.js')\`
 * from a DIFFERENT file -- every other file in this build that needs it
 * carries its own local copy of the typedef instead (see \`DataTexture.js\`'s
 * and \`Source.js\`'s own \`NativeTextureImage\` blocks in the base plugin), and
 * an unresolved type reference silently becomes \`any\`. Leaving the return
 * type to be inferred from \`texture.image\` -- a normal property read on a
 * real class import, resolved the same way \`DataTexture.js\`'s already-working
 * \`Texture['image']\` indexed-access reads are -- gets the real narrowed
 * record type instead.
 * @param {DataTexture} texture
 */
function textureImageRecord( texture ) {

\tconst image = texture.image;
\tif ( image !== null && ! Array.isArray( image ) ) return image;

\tthrow new Error( 'THREE.BatchedMesh: data texture image must be a native image record.' );

}

/**
 * The numeric-array payload behind a BatchedMesh data texture's image --
 * never absent in this file, since every texture that reaches here was
 * constructed with a \`data\` array up front. Reading it through this
 * narrowing function, instead of casting at each of the ~15 call sites, is
 * what lets every \`.image.data\` read stay a plain typed-array read.
 * @param {DataTexture} texture
 * @return {Float32Array|Uint32Array}
 */
function textureData( texture ) {

\tconst data = textureImageRecord( texture ).data;
\t// \`data\` is optional on the record (\`data?: NativeTextureData\`); the
\t// compiler's \`instanceof\` support for a native typed-array handle covers a
\t// bare disjoint union, not one still joined with \`undefined\` -- narrow that
\t// away first so the two \`instanceof\` checks below run against the plain
\t// 9-way typed-array union instead.
\tif ( data === undefined ) {

\t\tthrow new Error( 'THREE.BatchedMesh: data texture image data must be a Float32Array or Uint32Array.' );

\t}

\tif ( data instanceof Float32Array || data instanceof Uint32Array ) return data;

\tthrow new Error( 'THREE.BatchedMesh: data texture image data must be a Float32Array or Uint32Array.' );

}

/** @param {DataTexture} texture @return {DataTexture} */
function cloneBatchedTexture( texture ) {

\tconst clone = texture.clone();
\tconst image = textureImageRecord( texture );
\t// Texture.clone shares Source. Replacing image.data on that shared Source
\t// also changes the original batch, even if the array itself was sliced.
\tclone.source = new Source( { data: textureData( texture ).slice(), width: image.width, height: image.height } );
\treturn clone;

}`

/**
 * Rewrites `three/src/objects/BatchedMesh.js` (the
 * `text` a plugin's `transformSource` hostShim receives for that file) so it
 * can be investigated under geatsc's native type and emission checks.
 *
 * @param {string} transformed - The source text to rewrite (already run
 *   through any earlier transforms for this file).
 * @param {string} fileName - The file's path, forwarded to `replaceOne` for
 *   its error messages.
 * @param {(text: string, before: string, after: string, fileName: string, description: string) => string} replaceOne
 *   Same helper `transformUniformsLib` takes: asserts `before` is present
 *   exactly once (well, present at all -- see its definition) and returns
 *   the replacement, throwing loudly if three's source has drifted out from
 *   under this rewrite.
 * @return {string}
 */
export function transformBatchedMesh( transformed, fileName, replaceOne ) {

  transformed = replaceOne(transformed,
    '@type {?Function}\n\t\t * @default null\n\t\t */\n\t\tthis.customSort = null;',
    '@type {NativeBatchedSort|null}\n\t\t * @default null\n\t\t */\n\t\tthis.customSort = null;',
    fileName, 'BatchedMesh custom sort callable contract')
  transformed = replaceOne(transformed,
    // The compiler may already have enriched this parameter from @types/three.
    transformed.match(/@param \{[^\n]+\} func - The custom sort function\./)?.[0]
      ?? '@param {Function} func - The custom sort function.',
    '@param {NativeBatchedSort|null} func - The custom sort function.',
    fileName, 'BatchedMesh custom sort setter contract')

  const callbackGroup = '{start:number,count:number,materialIndex?:number}|null'
  const callbackTypes = ` * @param {import('../renderers/WebGLRenderer.js').WebGLRenderer} renderer
 * @param {import('../cameras/Camera.js').Camera} camera
 * @param {BufferGeometry} geometry`
  transformed = replaceOne(transformed,
    '\tonBeforeShadow( renderer, object, camera, shadowCamera, geometry, depthMaterial/* , group */ ) {',
    `\t/**
${callbackTypes}
 * @param {import('../core/Object3D.js').Object3D} object
 * @param {import('../cameras/Camera.js').Camera} shadowCamera
 * @param {import('../materials/Material.js').Material} depthMaterial
 * @param {${callbackGroup}} [group]
 */
\tonBeforeShadow( renderer, object, camera, shadowCamera, geometry, depthMaterial, group ) {`,
    fileName, 'BatchedMesh documented shadow callback contract')
  transformed = replaceOne(transformed,
    '\tonBeforeRender( renderer, scene, camera, geometry, material/*, _group*/ ) {',
    `\t/**
${callbackTypes}
 * @param {import('../scenes/Scene.js').Scene|null} scene
 * @param {import('../materials/Material.js').Material} material
 * @param {${callbackGroup}} [group]
 */
\tonBeforeRender( renderer, scene, camera, geometry, material, group ) {`,
    fileName, 'BatchedMesh documented render callback contract')

  // Object3D.clone invokes this constructor with no arguments before copy().
  // The missing capacities must remain undefined, not be unboxed as numbers.
  for (const [name, description] of [
    ['maxInstanceCount', 'The maximum number of individual instances planned to be added and rendered.'],
    ['maxVertexCount', 'The maximum number of vertices to be used by all unique geometries.'],
  ]) {
    transformed = replaceOne(
      transformed,
      `@param {number} ${name} - ${description}`,
      `@param {number} [${name}] - ${description}`,
      fileName,
      'BatchedMesh no-argument clone constructor contract',
    )
  }

  transformed = replaceOne(
    transformed,
    'function ascIdSort( a, b ) {',
    '/** @param {number} a @param {number} b */\nfunction ascIdSort( a, b ) {',
    fileName,
    'BatchedMesh recycled numeric ID comparator types',
  )

  // Geometry creation uses the same native typed-array factory as BufferGeometry.
  // Sources may be interleaved; the destination attributes are always plain.
  transformed = replaceOne(
    transformed,
    '\t_initializeGeometry( reference ) {',
    '\t/** @param {BufferGeometry} reference */\n\t_initializeGeometry( reference ) {',
    fileName,
    'BatchedMesh reference geometry contract',
  )
  transformed = replaceOne(
    transformed,
    'const dstArray = new array.constructor( maxVertexCount * itemSize );',
    'const dstArray = createBatchedArrayWithLength( array, maxVertexCount * itemSize );',
    fileName,
    'BatchedMesh native geometry array allocation',
  )
  for (const [owner, count] of [['reference', 1], ['geometry', 2]]) {
    for (let i = 0; i < count; i++) {
      transformed = replaceOne(
        transformed,
        `const srcAttribute = ${owner}.getAttribute( attributeName );`,
        `const srcAttribute = sourceAttribute( ${owner}, attributeName );`,
        fileName,
        'BatchedMesh required source attribute',
      )
    }
  }
  for (let i = 0; i < 2; i++) {
    transformed = replaceOne(
      transformed,
      'const dstAttribute = batchGeometry.getAttribute( attributeName );',
      'const dstAttribute = batchedAttribute( batchGeometry, attributeName );',
      fileName,
      'BatchedMesh concrete destination attribute',
    )
  }
  transformed = replaceOne(
    transformed,
    'function copyAttributeData( src, target, targetOffset = 0 ) {',
    '/** @param {BufferAttribute|import(\'../core/InterleavedBufferAttribute.js\').InterleavedBufferAttribute} src @param {BufferAttribute} target @param {number} targetOffset */\nfunction copyAttributeData( src, target, targetOffset = 0 ) {',
    fileName,
    'BatchedMesh attribute copy contract',
  )
  const arrayKinds = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array']
  transformed = replaceOne(
    transformed,
    'src.array.constructor !== target.array.constructor',
    `! ( ${arrayKinds.map(kind => `( src.array instanceof ${kind} && target.array instanceof ${kind} )`).join(' || ')} )`,
    fileName,
    'BatchedMesh native attribute storage comparison',
  )
  transformed = replaceOne(
    transformed,
    'geometryId = this._availableGeometryIds.shift();',
    `const nextId = this._availableGeometryIds.shift();
\t\t\tif ( nextId === undefined ) throw new Error( 'THREE.BatchedMesh: available geometry id list unexpectedly empty.' );
\t\t\tgeometryId = nextId;`,
    fileName,
    'BatchedMesh recycled geometry ID invariant',
  )

  transformed = replaceOne(
    transformed,
    "import { DataTexture } from '../textures/DataTexture.js';",
    "import { DataTexture } from '../textures/DataTexture.js';\nimport { Source } from '../textures/Source.js';",
    fileName,
    'BatchedMesh independent texture source import',
  )

  // 1. `camera.coordinateSystem` (used below, in onBeforeRender) is typed
  // `any` in three's own JSDoc; import the same named constant the renderer's
  // own copy of this call already uses instead.
  transformed = replaceOne(
    transformed,
    `import { FloatType, RedIntegerFormat, UnsignedIntType, RGBAFormat } from '../constants.js';`,
    `import { FloatType, RedIntegerFormat, UnsignedIntType, RGBAFormat, WebGLCoordinateSystem } from '../constants.js';`,
    fileName,
    'BatchedMesh coordinate-system constant import',
  )

  // 1b. `sortOpaque`/`sortTransparent` are the comparators `onBeforeRender()`
  // passes to `Array.prototype.sort` on `MultiDrawRenderList`'s `list`; three
  // leaves both the comparator parameters and the list's own `pool`/`list`
  // fields untyped, so the `.z` reads (and the subtraction over them) resolve
  // to `any`. This was invisible while BatchedMesh's own class body was never
  // referenced from a live call site; once it is, `a.z - b.z` on a `dynamic`
  // carrier has no C++ spelling and emission refuses it.
  transformed = replaceOne(
    transformed,
    `function sortOpaque( a, b ) {

\treturn a.z - b.z;

}

function sortTransparent( a, b ) {

\treturn b.z - a.z;

}

class MultiDrawRenderList {

\tconstructor() {

\t\tthis.index = 0;
\t\tthis.pool = [];
\t\tthis.list = [];

\t}

\tpush( start, count, z, index ) {

\t\tconst pool = this.pool;
\t\tconst list = this.list;
\t\tif ( this.index >= pool.length ) {

\t\t\tpool.push( {

\t\t\t\tstart: - 1,
\t\t\t\tcount: - 1,
\t\t\t\tz: - 1,
\t\t\t\tindex: - 1,

\t\t\t} );

\t\t}

\t\tconst item = pool[ this.index ];
\t\tlist.push( item );
\t\tthis.index ++;

\t\titem.start = start;
\t\titem.count = count;
\t\titem.z = z;
\t\titem.index = index;

\t}

\treset() {

\t\tthis.list.length = 0;
\t\tthis.index = 0;

\t}

}`,
    `/** @param {NativeBatchedRenderListItem} a @param {NativeBatchedRenderListItem} b */
function sortOpaque( a, b ) {

\treturn a.z - b.z;

}

/** @param {NativeBatchedRenderListItem} a @param {NativeBatchedRenderListItem} b */
function sortTransparent( a, b ) {

\treturn b.z - a.z;

}

class MultiDrawRenderList {

\tconstructor() {

\t\tthis.index = 0;
\t\t/** @type {NativeBatchedRenderListItem[]} */
\t\tthis.pool = [];
\t\t/** @type {NativeBatchedRenderListItem[]} */
\t\tthis.list = [];

\t}

\t/** @param {number} start @param {number} count @param {number} z @param {number} index */
\tpush( start, count, z, index ) {

\t\tconst pool = this.pool;
\t\tconst list = this.list;
\t\tif ( this.index >= pool.length ) {

\t\t\tpool.push( {

\t\t\t\tstart: - 1,
\t\t\t\tcount: - 1,
\t\t\t\tz: - 1,
\t\t\t\tindex: - 1,

\t\t\t} );

\t\t}

\t\tconst item = pool[ this.index ];
\t\tlist.push( item );
\t\tthis.index ++;

\t\titem.start = start;
\t\titem.count = count;
\t\titem.z = z;
\t\titem.index = index;

\t}

\treset() {

\t\tthis.list.length = 0;
\t\tthis.index = 0;

\t}

}`,
    fileName,
    'BatchedMesh MultiDrawRenderList and sort comparator types',
  )

  // 2. Insert the typedefs and the three module-level helpers right where
  // `copyArrayContents` already lives, replacing its untyped body with a
  // typed one and appending `textureImageRecord`/`textureData` after it.
  transformed = replaceOne(
    transformed,
    `// safely copies array contents to a potentially smaller array
function copyArrayContents( src, target ) {

\tif ( src.constructor !== target.constructor ) {

\t\t// if arrays are of a different type (eg due to index size increasing) then data must be per-element copied
\t\tconst len = Math.min( src.length, target.length );
\t\tfor ( let i = 0; i < len; i ++ ) {

\t\t\ttarget[ i ] = src[ i ];

\t\t}

\t} else {

\t\t// if the arrays use the same data layout we can use a fast block copy
\t\tconst len = Math.min( src.length, target.length );
\t\ttarget.set( new src.constructor( src.buffer, 0, len ) );

\t}

}`,
    `${batchedMeshTypedefs}

${batchedMeshHelpers}`,
    fileName,
    'BatchedMesh typedefs and native array/texture helpers',
  )

  // 3. `_instanceInfo`/`_geometryInfo`/`_availableInstanceIds`/`_availableGeometryIds`
  // are built as untyped `[]`; state the element type at each declaration.
  transformed = replaceOne(
    transformed,
    `\t\t// stores visible, active, and geometry id per instance and reserved buffer ranges for geometries
\t\tthis._instanceInfo = [];
\t\tthis._geometryInfo = [];

\t\t// instance, geometry ids that have been set as inactive, and are available to be overwritten
\t\tthis._availableInstanceIds = [];
\t\tthis._availableGeometryIds = [];`,
    `\t\t// stores visible, active, and geometry id per instance and reserved buffer ranges for geometries
\t\t/** @type {NativeBatchedInstanceInfo[]} */
\t\tthis._instanceInfo = [];
\t\t/** @type {NativeBatchedGeometryInfo[]} */
\t\tthis._geometryInfo = [];

\t\t// instance, geometry ids that have been set as inactive, and are available to be overwritten
\t\t/** @type {number[]} */
\t\tthis._availableInstanceIds = [];
\t\t/** @type {number[]} */
\t\tthis._availableGeometryIds = [];`,
    fileName,
    'BatchedMesh geometry/instance bookkeeping array types',
  )

  // 4. `_matricesTexture`/`_indirectTexture` start life as `this._x = null;`
  // here, filled in one statement later by a void-returning `_init*Texture()`
  // (rewritten below to return the texture instead) -- assign the value
  // directly so both fields are `DataTexture`, never `DataTexture|null`.
  // `_colorsTexture` stays lazily created (three's own behaviour: not every
  // batch uses per-instance colour) so it keeps its nullable type.
  transformed = replaceOne(
    transformed,
    `\t\t// Local matrix per geometry by using data texture
\t\tthis._matricesTexture = null;
\t\tthis._indirectTexture = null;
\t\tthis._colorsTexture = null;

\t\tthis._initMatricesTexture();
\t\tthis._initIndirectTexture();

\t}`,
    `\t\t// Local matrix per geometry by using data texture. \`_matricesTexture\` and
\t\t// \`_indirectTexture\` are always live: three's own \`_init*Texture()\` used
\t\t// to assign \`this._x = null\` here and fill it in one statement later via
\t\t// a void-returning call, leaving every downstream reader with a nullable
\t\t// field the checker could never narrow away. Assigning straight from the
\t\t// (now value-returning) init methods keeps both fields non-null from
\t\t// construction on, matching how every other method already treats them.
\t\tthis._matricesTexture = this._initMatricesTexture();
\t\tthis._indirectTexture = this._initIndirectTexture();
\t\t/** @type {DataTexture|null} */
\t\tthis._colorsTexture = null;

\t}`,
    fileName,
    'BatchedMesh non-null matrices/indirect textures',
  )

  // 5. Make `_initMatricesTexture()`/`_initIndirectTexture()` return the
  // texture instead of assigning `this._x` internally (so the constructor and
  // `setInstanceCount()` both get a plain `DataTexture` value); `_initColorsTexture()`
  // keeps its internal assignment (still relied on: it is `_colorsTexture`'s
  // own initializer) and additionally returns the texture, for the two call
  // sites (`setColorAt`, `setInstanceCount`) that need the freshly created value.
  transformed = replaceOne(
    transformed,
    `\t_initMatricesTexture() {

\t\t// layout (1 matrix = 4 pixels)
\t\t//      RGBA RGBA RGBA RGBA (=> column1, column2, column3, column4)
\t\t//  with  8x8  pixel texture max   16 matrices * 4 pixels =  (8 * 8)
\t\t//       16x16 pixel texture max   64 matrices * 4 pixels = (16 * 16)
\t\t//       32x32 pixel texture max  256 matrices * 4 pixels = (32 * 32)
\t\t//       64x64 pixel texture max 1024 matrices * 4 pixels = (64 * 64)

\t\tlet size = Math.sqrt( this._maxInstanceCount * 4 ); // 4 pixels needed for 1 matrix
\t\tsize = Math.ceil( size / 4 ) * 4;
\t\tsize = Math.max( size, 4 );

\t\tconst matricesArray = new Float32Array( size * size * 4 ); // 4 floats per RGBA pixel
\t\tconst matricesTexture = new DataTexture( matricesArray, size, size, RGBAFormat, FloatType );

\t\tthis._matricesTexture = matricesTexture;

\t}

\t_initIndirectTexture() {

\t\tlet size = Math.sqrt( this._maxInstanceCount );
\t\tsize = Math.ceil( size );

\t\tconst indirectArray = new Uint32Array( size * size );
\t\tconst indirectTexture = new DataTexture( indirectArray, size, size, RedIntegerFormat, UnsignedIntType );

\t\tthis._indirectTexture = indirectTexture;

\t}

\t_initColorsTexture() {

\t\tlet size = Math.sqrt( this._maxInstanceCount );
\t\tsize = Math.ceil( size );

\t\t// 4 floats per RGBA pixel initialized to white
\t\tconst colorsArray = new Float32Array( size * size * 4 ).fill( 1 );
\t\tconst colorsTexture = new DataTexture( colorsArray, size, size, RGBAFormat, FloatType );
\t\tcolorsTexture.colorSpace = ColorManagement.workingColorSpace;

\t\tthis._colorsTexture = colorsTexture;

\t}`,
    `\t/** @return {DataTexture} */
\t_initMatricesTexture() {

\t\t// layout (1 matrix = 4 pixels)
\t\t//      RGBA RGBA RGBA RGBA (=> column1, column2, column3, column4)
\t\t//  with  8x8  pixel texture max   16 matrices * 4 pixels =  (8 * 8)
\t\t//       16x16 pixel texture max   64 matrices * 4 pixels = (16 * 16)
\t\t//       32x32 pixel texture max  256 matrices * 4 pixels = (32 * 32)
\t\t//       64x64 pixel texture max 1024 matrices * 4 pixels = (64 * 64)

\t\tlet size = Math.sqrt( this._maxInstanceCount * 4 ); // 4 pixels needed for 1 matrix
\t\tsize = Math.ceil( size / 4 ) * 4;
\t\tsize = Math.max( size, 4 );

\t\tconst matricesArray = new Float32Array( size * size * 4 ); // 4 floats per RGBA pixel
\t\t// returned rather than assigned here -- both the constructor and
\t\t// setInstanceCount() need the fresh value itself, not a void call that
\t\t// reaches into \`this\` behind the checker's back.
\t\treturn new DataTexture( matricesArray, size, size, RGBAFormat, FloatType );

\t}

\t/** @return {DataTexture} */
\t_initIndirectTexture() {

\t\tlet size = Math.sqrt( this._maxInstanceCount );
\t\tsize = Math.ceil( size );

\t\tconst indirectArray = new Uint32Array( size * size );
\t\treturn new DataTexture( indirectArray, size, size, RedIntegerFormat, UnsignedIntType );

\t}

\t/** @return {DataTexture} */
\t_initColorsTexture() {

\t\tlet size = Math.sqrt( this._maxInstanceCount );
\t\tsize = Math.ceil( size );

\t\t// 4 floats per RGBA pixel initialized to white
\t\tconst colorsArray = new Float32Array( size * size * 4 ).fill( 1 );
\t\tconst colorsTexture = new DataTexture( colorsArray, size, size, RGBAFormat, FloatType );
\t\tcolorsTexture.colorSpace = ColorManagement.workingColorSpace;

\t\tthis._colorsTexture = colorsTexture;
\t\treturn colorsTexture;

\t}`,
    fileName,
    'BatchedMesh value-returning texture initializers',
  )

  // 6. `addInstance()`: `drawId` starts `null` then is reassigned a
  // `number|undefined` from `.shift()` without a guard; and both texture
  // writes read `.image.data` directly.
  transformed = replaceOne(
    transformed,
    `\taddInstance( geometryId ) {

\t\tconst atCapacity = this._instanceInfo.length >= this.maxInstanceCount;

\t\t// ensure we're not over geometry
\t\tif ( atCapacity && this._availableInstanceIds.length === 0 ) {

\t\t\tthrow new Error( 'THREE.BatchedMesh: Maximum item count reached.' );

\t\t}

\t\tconst instanceInfo = {
\t\t\tvisible: true,
\t\t\tactive: true,
\t\t\tgeometryIndex: geometryId,
\t\t};

\t\tlet drawId = null;

\t\t// Prioritize using previously freed instance ids
\t\tif ( this._availableInstanceIds.length > 0 ) {

\t\t\tthis._availableInstanceIds.sort( ascIdSort );

\t\t\tdrawId = this._availableInstanceIds.shift();
\t\t\tthis._instanceInfo[ drawId ] = instanceInfo;

\t\t} else {

\t\t\tdrawId = this._instanceInfo.length;
\t\t\tthis._instanceInfo.push( instanceInfo );

\t\t}

\t\tconst matricesTexture = this._matricesTexture;
\t\t_matrix.identity().toArray( matricesTexture.image.data, drawId * 16 );
\t\tmatricesTexture.needsUpdate = true;

\t\tconst colorsTexture = this._colorsTexture;
\t\tif ( colorsTexture ) {

\t\t\t_whiteColor.toArray( colorsTexture.image.data, drawId * 4 );
\t\t\tcolorsTexture.needsUpdate = true;

\t\t}

\t\tthis._visibilityChanged = true;
\t\treturn drawId;

\t}`,
    `\taddInstance( geometryId ) {

\t\tconst atCapacity = this._instanceInfo.length >= this.maxInstanceCount;

\t\t// ensure we're not over geometry
\t\tif ( atCapacity && this._availableInstanceIds.length === 0 ) {

\t\t\tthrow new Error( 'THREE.BatchedMesh: Maximum item count reached.' );

\t\t}

\t\t/** @type {NativeBatchedInstanceInfo} */
\t\tconst instanceInfo = {
\t\t\tvisible: true,
\t\t\tactive: true,
\t\t\tgeometryIndex: geometryId,
\t\t};

\t\t/** @type {number} */
\t\tlet drawId;

\t\t// Prioritize using previously freed instance ids
\t\tif ( this._availableInstanceIds.length > 0 ) {

\t\t\tthis._availableInstanceIds.sort( ascIdSort );

\t\t\t// \`.shift()\` types as \`number|undefined\`; the length check just above
\t\t\t// guarantees a value every time -- state that as a thrown guard
\t\t\t// instead of a cast, so \`drawId\` stays a plain \`number\`.
\t\t\tconst nextId = this._availableInstanceIds.shift();
\t\t\tif ( nextId === undefined ) {

\t\t\t\tthrow new Error( 'THREE.BatchedMesh: available instance id list unexpectedly empty.' );

\t\t\t}

\t\t\tdrawId = nextId;
\t\t\tthis._instanceInfo[ drawId ] = instanceInfo;

\t\t} else {

\t\t\tdrawId = this._instanceInfo.length;
\t\t\tthis._instanceInfo.push( instanceInfo );

\t\t}

\t\tconst matricesTexture = this._matricesTexture;
\t\t_matrix.identity().toArray( textureData( matricesTexture ), drawId * 16 );
\t\tmatricesTexture.needsUpdate = true;

\t\tconst colorsTexture = this._colorsTexture;
\t\tif ( colorsTexture ) {

\t\t\t_whiteColor.toArray( textureData( colorsTexture ), drawId * 4 );
\t\t\tcolorsTexture.needsUpdate = true;

\t\t}

\t\tthis._visibilityChanged = true;
\t\treturn drawId;

\t}`,
    fileName,
    'BatchedMesh addInstance typed drawId and texture writes',
  )

  // 7. `addGeometry()`'s `geometryInfo` literal has two `null` fields
  // (`boundingBox`, `boundingSphere`) that need widening to the typedef's
  // `Box3|null`/`Sphere|null` arms.
  transformed = replaceOne(
    transformed,
    `\t\tconst geometryInfo = {
\t\t\t// geometry information
\t\t\tvertexStart: - 1,
\t\t\tvertexCount: - 1,
\t\t\treservedVertexCount: - 1,

\t\t\tindexStart: - 1,
\t\t\tindexCount: - 1,
\t\t\treservedIndexCount: - 1,

\t\t\t// draw range information
\t\t\tstart: - 1,
\t\t\tcount: - 1,

\t\t\t// state
\t\t\tboundingBox: null,
\t\t\tboundingSphere: null,
\t\t\tactive: true,
\t\t};`,
    `\t\t/** @type {NativeBatchedGeometryInfo} */
\t\tconst geometryInfo = {
\t\t\t// geometry information
\t\t\tvertexStart: - 1,
\t\t\tvertexCount: - 1,
\t\t\treservedVertexCount: - 1,

\t\t\tindexStart: - 1,
\t\t\tindexCount: - 1,
\t\t\treservedIndexCount: - 1,

\t\t\t// draw range information
\t\t\tstart: - 1,
\t\t\tcount: - 1,

\t\t\t// state
\t\t\tboundingBox: null,
\t\t\tboundingSphere: null,
\t\t\tactive: true,
\t\t};`,
    fileName,
    'BatchedMesh addGeometry geometryInfo literal type',
  )

  // 8. `setMatrixAt`/`getMatrixAt` read `.image.data` off `_matricesTexture` directly.
  transformed = replaceOne(
    transformed,
    `\tsetMatrixAt( instanceId, matrix ) {

\t\tthis.validateInstanceId( instanceId );

\t\tconst matricesTexture = this._matricesTexture;
\t\tconst matricesArray = this._matricesTexture.image.data;
\t\tmatrix.toArray( matricesArray, instanceId * 16 );
\t\tmatricesTexture.needsUpdate = true;

\t\treturn this;

\t}

\t/**
\t * Returns the local transformation matrix of the defined instance.
\t *
\t * @param {number} instanceId - The ID of an instance to get the matrix of.
\t * @param {Matrix4} matrix - The target object that is used to store the method's result.
\t * @return {Matrix4} The instance's local transformation matrix.
\t */
\tgetMatrixAt( instanceId, matrix ) {

\t\tthis.validateInstanceId( instanceId );
\t\treturn matrix.fromArray( this._matricesTexture.image.data, instanceId * 16 );

\t}`,
    `\tsetMatrixAt( instanceId, matrix ) {

\t\tthis.validateInstanceId( instanceId );

\t\tconst matricesTexture = this._matricesTexture;
\t\tconst matricesArray = textureData( matricesTexture );
\t\tmatrix.toArray( matricesArray, instanceId * 16 );
\t\tmatricesTexture.needsUpdate = true;

\t\treturn this;

\t}

\t/**
\t * Returns the local transformation matrix of the defined instance.
\t *
\t * @param {number} instanceId - The ID of an instance to get the matrix of.
\t * @param {Matrix4} matrix - The target object that is used to store the method's result.
\t * @return {Matrix4} The instance's local transformation matrix.
\t */
\tgetMatrixAt( instanceId, matrix ) {

\t\tthis.validateInstanceId( instanceId );
\t\treturn matrix.fromArray( textureData( this._matricesTexture ), instanceId * 16 );

\t}`,
    fileName,
    'BatchedMesh setMatrixAt/getMatrixAt native texture reads',
  )

  // 9. `setColorAt`/`getColorAt`: `_colorsTexture` is nullable and lazily
  // created; narrow to a local before reading `.image.data`.
  transformed = replaceOne(
    transformed,
    `\tsetColorAt( instanceId, color ) {

\t\tthis.validateInstanceId( instanceId );

\t\tif ( this._colorsTexture === null ) {

\t\t\tthis._initColorsTexture();

\t\t}

\t\tcolor.toArray( this._colorsTexture.image.data, instanceId * 4 );
\t\tthis._colorsTexture.needsUpdate = true;

\t\treturn this;

\t}

\t/**
\t * Returns the color of the defined instance.
\t *
\t * @param {number} instanceId - The ID of an instance to get the color of.
\t * @param {Color|Vector4} color - The target object that is used to store the method's result.
\t * @return {Color|Vector4} The instance's color.  Use a \`Vector4\` to also retrieve alpha.
\t */
\tgetColorAt( instanceId, color ) {

\t\tthis.validateInstanceId( instanceId );
\t\tif ( this._colorsTexture === null ) {

\t\t\tif ( color.isVector4 ) {

\t\t\t\treturn color.set( 1, 1, 1, 1 );

\t\t\t} else {

\t\t\t\treturn color.setRGB( 1, 1, 1 );

\t\t\t}

\t\t} else {

\t\t\treturn color.fromArray( this._colorsTexture.image.data, instanceId * 4 );

\t\t}

\t}`,
    `\tsetColorAt( instanceId, color ) {

\t\tthis.validateInstanceId( instanceId );

\t\t// \`_colorsTexture\` is allocated lazily; narrow to the concrete texture
\t\t// this write targets instead of re-reading the nullable field below.
\t\tconst colorsTexture = this._colorsTexture === null ? this._initColorsTexture() : this._colorsTexture;

\t\tcolor.toArray( textureData( colorsTexture ), instanceId * 4 );
\t\tcolorsTexture.needsUpdate = true;

\t\treturn this;

\t}

\t/**
\t * Returns the color of the defined instance.
\t *
\t * @param {number} instanceId - The ID of an instance to get the color of.
\t * @param {Color|Vector4} color - The target object that is used to store the method's result.
\t * @return {Color|Vector4} The instance's color.  Use a \`Vector4\` to also retrieve alpha.
\t */
\tgetColorAt( instanceId, color ) {

\t\tthis.validateInstanceId( instanceId );
\t\tconst colorsTexture = this._colorsTexture;
\t\tif ( colorsTexture === null ) {

\t\t\tif ( color.isVector4 ) {

\t\t\t\treturn color.set( 1, 1, 1, 1 );

\t\t\t} else {

\t\t\t\treturn color.setRGB( 1, 1, 1 );

\t\t\t}

\t\t} else {

\t\t\treturn color.fromArray( textureData( colorsTexture ), instanceId * 4 );

\t\t}

\t}`,
    fileName,
    'BatchedMesh setColorAt/getColorAt native texture reads',
  )

  // 10. `setInstanceCount()`: three's `_init*Texture()` calls relied on the
  // void-returning form's internal assignment; capture the (now returned)
  // value explicitly, and route every `.image.data` read/write through
  // `textureData()`.
  transformed = replaceOne(
    transformed,
    `\tsetInstanceCount( maxInstanceCount ) {

\t\t// shrink the available instances as much as possible
\t\tconst availableInstanceIds = this._availableInstanceIds;
\t\tconst instanceInfo = this._instanceInfo;
\t\tavailableInstanceIds.sort( ascIdSort );
\t\twhile ( availableInstanceIds[ availableInstanceIds.length - 1 ] === instanceInfo.length - 1 ) {

\t\t\tinstanceInfo.pop();
\t\t\tavailableInstanceIds.pop();

\t\t}

\t\t// throw an error if it can't be shrunk to the desired size
\t\tif ( maxInstanceCount < instanceInfo.length ) {

\t\t\tthrow new Error( \`THREE.BatchedMesh: Instance ids outside the range \${ maxInstanceCount } are being used. Cannot shrink instance count.\` );

\t\t}

\t\t// copy the multi draw counts
\t\tconst multiDrawCounts = new Int32Array( maxInstanceCount );
\t\tconst multiDrawStarts = new Int32Array( maxInstanceCount );
\t\tcopyArrayContents( this._multiDrawCounts, multiDrawCounts );
\t\tcopyArrayContents( this._multiDrawStarts, multiDrawStarts );

\t\tthis._multiDrawCounts = multiDrawCounts;
\t\tthis._multiDrawStarts = multiDrawStarts;
\t\tthis._maxInstanceCount = maxInstanceCount;

\t\t// update texture data for instance sampling
\t\tconst indirectTexture = this._indirectTexture;
\t\tconst matricesTexture = this._matricesTexture;
\t\tconst colorsTexture = this._colorsTexture;

\t\tindirectTexture.dispose();
\t\tthis._initIndirectTexture();
\t\tcopyArrayContents( indirectTexture.image.data, this._indirectTexture.image.data );

\t\tmatricesTexture.dispose();
\t\tthis._initMatricesTexture();
\t\tcopyArrayContents( matricesTexture.image.data, this._matricesTexture.image.data );

\t\tif ( colorsTexture ) {

\t\t\tcolorsTexture.dispose();
\t\t\tthis._initColorsTexture();
\t\t\tcopyArrayContents( colorsTexture.image.data, this._colorsTexture.image.data );

\t\t}

\t}`,
    `\tsetInstanceCount( maxInstanceCount ) {

\t\t// shrink the available instances as much as possible
\t\tconst availableInstanceIds = this._availableInstanceIds;
\t\tconst instanceInfo = this._instanceInfo;
\t\tavailableInstanceIds.sort( ascIdSort );
\t\twhile ( availableInstanceIds[ availableInstanceIds.length - 1 ] === instanceInfo.length - 1 ) {

\t\t\tinstanceInfo.pop();
\t\t\tavailableInstanceIds.pop();

\t\t}

\t\t// throw an error if it can't be shrunk to the desired size
\t\tif ( maxInstanceCount < instanceInfo.length ) {

\t\t\tthrow new Error( \`THREE.BatchedMesh: Instance ids outside the range \${ maxInstanceCount } are being used. Cannot shrink instance count.\` );

\t\t}

\t\t// copy the multi draw counts
\t\tconst multiDrawCounts = new Int32Array( maxInstanceCount );
\t\tconst multiDrawStarts = new Int32Array( maxInstanceCount );
\t\tcopyArrayContents( this._multiDrawCounts, multiDrawCounts );
\t\tcopyArrayContents( this._multiDrawStarts, multiDrawStarts );

\t\tthis._multiDrawCounts = multiDrawCounts;
\t\tthis._multiDrawStarts = multiDrawStarts;
\t\tthis._maxInstanceCount = maxInstanceCount;

\t\t// update texture data for instance sampling
\t\tconst indirectTexture = this._indirectTexture;
\t\tconst matricesTexture = this._matricesTexture;
\t\tconst colorsTexture = this._colorsTexture;

\t\tindirectTexture.dispose();
\t\tthis._indirectTexture = this._initIndirectTexture();
\t\tcopyArrayContents( textureData( indirectTexture ), textureData( this._indirectTexture ) );

\t\tmatricesTexture.dispose();
\t\tthis._matricesTexture = this._initMatricesTexture();
\t\tcopyArrayContents( textureData( matricesTexture ), textureData( this._matricesTexture ) );

\t\tif ( colorsTexture ) {

\t\t\tcolorsTexture.dispose();
\t\t\tconst newColorsTexture = this._initColorsTexture();
\t\t\tcopyArrayContents( textureData( colorsTexture ), textureData( newColorsTexture ) );

\t\t}

\t}`,
    fileName,
    'BatchedMesh setInstanceCount native texture reassignment and reads',
  )

  // 11. `copy()`: the `...info` object spreads are the boxing shortcut this
  // build refuses for a typed record -- copy each field explicitly instead.
  // Also fixes a real upstream bug (see the comment inline) and routes every
  // `.image.data` read/write through the two texture helpers.
  transformed = replaceOne(
    transformed,
    `\tcopy( source ) {

\t\tsuper.copy( source );

\t\tthis.geometry = source.geometry.clone();
\t\tthis.perObjectFrustumCulled = source.perObjectFrustumCulled;
\t\tthis.sortObjects = source.sortObjects;
\t\tthis.boundingBox = source.boundingBox !== null ? source.boundingBox.clone() : null;
\t\tthis.boundingSphere = source.boundingSphere !== null ? source.boundingSphere.clone() : null;

\t\tthis._geometryInfo = source._geometryInfo.map( info => ( {
\t\t\t...info,

\t\t\tboundingBox: info.boundingBox !== null ? info.boundingBox.clone() : null,
\t\t\tboundingSphere: info.boundingSphere !== null ? info.boundingSphere.clone() : null,
\t\t} ) );
\t\tthis._instanceInfo = source._instanceInfo.map( info => ( { ...info } ) );

\t\tthis._availableInstanceIds = source._availableInstanceIds.slice();
\t\tthis._availableGeometryIds = source._availableGeometryIds.slice();

\t\tthis._nextIndexStart = source._nextIndexStart;
\t\tthis._nextVertexStart = source._nextVertexStart;
\t\tthis._geometryCount = source._geometryCount;

\t\tthis._maxInstanceCount = source._maxInstanceCount;
\t\tthis._maxVertexCount = source._maxVertexCount;
\t\tthis._maxIndexCount = source._maxIndexCount;

\t\tthis._geometryInitialized = source._geometryInitialized;
\t\tthis._multiDrawCounts = source._multiDrawCounts.slice();
\t\tthis._multiDrawStarts = source._multiDrawStarts.slice();

\t\tthis._indirectTexture = source._indirectTexture.clone();
\t\tthis._indirectTexture.image.data = this._indirectTexture.image.data.slice();

\t\tthis._matricesTexture = source._matricesTexture.clone();
\t\tthis._matricesTexture.image.data = this._matricesTexture.image.data.slice();

\t\tif ( this._colorsTexture !== null ) {

\t\t\tthis._colorsTexture = source._colorsTexture.clone();
\t\t\tthis._colorsTexture.image.data = this._colorsTexture.image.data.slice();

\t\t}

\t\treturn this;

\t}`,
    `\tcopy( source ) {

\t\tsuper.copy( source );

\t\tthis.geometry = source.geometry.clone();
\t\tthis.perObjectFrustumCulled = source.perObjectFrustumCulled;
\t\tthis.sortObjects = source.sortObjects;
\t\tthis.boundingBox = source.boundingBox !== null ? source.boundingBox.clone() : null;
\t\tthis.boundingSphere = source.boundingSphere !== null ? source.boundingSphere.clone() : null;

\t\t// three writes \`...info\` (an object spread) here; spreading a typed
\t\t// record is the boxing shortcut this build refuses, so copy every field
\t\t// explicitly instead -- same resulting shape, same values.
\t\tthis._geometryInfo = source._geometryInfo.map( ( info ) => {

\t\t\t/** @type {NativeBatchedGeometryInfo} */
\t\t\tconst clonedInfo = {
\t\t\t\tvertexStart: info.vertexStart,
\t\t\t\tvertexCount: info.vertexCount,
\t\t\t\treservedVertexCount: info.reservedVertexCount,
\t\t\t\tindexStart: info.indexStart,
\t\t\t\tindexCount: info.indexCount,
\t\t\t\treservedIndexCount: info.reservedIndexCount,
\t\t\t\tstart: info.start,
\t\t\t\tcount: info.count,
\t\t\t\tboundingBox: info.boundingBox !== null ? info.boundingBox.clone() : null,
\t\t\t\tboundingSphere: info.boundingSphere !== null ? info.boundingSphere.clone() : null,
\t\t\t\tactive: info.active,
\t\t\t};
\t\t\treturn clonedInfo;

\t\t} );
\t\tthis._instanceInfo = source._instanceInfo.map( ( info ) => {

\t\t\t/** @type {NativeBatchedInstanceInfo} */
\t\t\tconst clonedInfo = {
\t\t\t\tvisible: info.visible,
\t\t\t\tactive: info.active,
\t\t\t\tgeometryIndex: info.geometryIndex,
\t\t\t};
\t\t\treturn clonedInfo;

\t\t} );

\t\tthis._availableInstanceIds = source._availableInstanceIds.slice();
\t\tthis._availableGeometryIds = source._availableGeometryIds.slice();

\t\tthis._nextIndexStart = source._nextIndexStart;
\t\tthis._nextVertexStart = source._nextVertexStart;
\t\tthis._geometryCount = source._geometryCount;

\t\tthis._maxInstanceCount = source._maxInstanceCount;
\t\tthis._maxVertexCount = source._maxVertexCount;
\t\tthis._maxIndexCount = source._maxIndexCount;

\t\tthis._geometryInitialized = source._geometryInitialized;
\t\tthis._multiDrawCounts = source._multiDrawCounts.slice();
\t\tthis._multiDrawStarts = source._multiDrawStarts.slice();

\t\tthis._indirectTexture = cloneBatchedTexture( source._indirectTexture );

\t\tthis._matricesTexture = cloneBatchedTexture( source._matricesTexture );

\t\t// three tests \`this._colorsTexture !== null\` here -- on the FRESH target,
\t\t// which \`super.copy()\` never populates, so that branch could never run;
\t\t// the evident intent (mirror source's colour texture) reads \`source._colorsTexture\`.
\t\tif ( source._colorsTexture !== null ) {

\t\t\tthis._colorsTexture = cloneBatchedTexture( source._colorsTexture );

\t\t} else {

\t\t\tthis._colorsTexture = null;

\t\t}

\t\treturn this;

\t}`,
    fileName,
    'BatchedMesh copy field-by-field bookkeeping and native texture clone',
  )

  // 12. `dispose()`: `_matricesTexture`/`_indirectTexture` are non-null
  // fields now, so they can no longer be set to `null` here.
  transformed = replaceOne(
    transformed,
    `\tdispose() {

\t\t// Assuming the geometry is not shared with other meshes
\t\tthis.geometry.dispose();

\t\tthis._matricesTexture.dispose();
\t\tthis._matricesTexture = null;

\t\tthis._indirectTexture.dispose();
\t\tthis._indirectTexture = null;

\t\tif ( this._colorsTexture !== null ) {

\t\t\tthis._colorsTexture.dispose();
\t\t\tthis._colorsTexture = null;

\t\t}

\t}`,
    `\tdispose() {

\t\t// Assuming the geometry is not shared with other meshes
\t\tthis.geometry.dispose();

\t\t// \`_matricesTexture\`/\`_indirectTexture\` are non-null \`DataTexture\` fields
\t\t// now (always live, unlike the lazily created \`_colorsTexture\`);
\t\t// disposing frees the GPU resource but the reference itself is kept --
\t\t// nothing reads from a disposed BatchedMesh's textures afterward, same
\t\t// as three's own nulling achieved for every consumer.
\t\tthis._matricesTexture.dispose();
\t\tthis._indirectTexture.dispose();

\t\tif ( this._colorsTexture !== null ) {

\t\t\tthis._colorsTexture.dispose();
\t\t\tthis._colorsTexture = null;

\t\t}

\t}`,
    fileName,
    'BatchedMesh dispose keeps non-null texture references',
  )

  // 13. `onBeforeRender()`: the indirect texture's `.image.data` read, and
  // the `camera.coordinateSystem` argument typed `any` in three's own JSDoc.
  transformed = replaceOne(
    transformed,
    `\t\tconst instanceInfo = this._instanceInfo;
\t\tconst multiDrawStarts = this._multiDrawStarts;
\t\tconst multiDrawCounts = this._multiDrawCounts;
\t\tconst geometryInfoList = this._geometryInfo;
\t\tconst perObjectFrustumCulled = this.perObjectFrustumCulled;
\t\tconst indirectTexture = this._indirectTexture;
\t\tconst indirectArray = indirectTexture.image.data;

\t\tconst frustum = camera.isArrayCamera ? _frustumArray : _frustum;
\t\t// prepare the frustum in the local frame
\t\tif ( perObjectFrustumCulled ) {

\t\t\tif ( camera.isArrayCamera ) {

\t\t\t\tfrustum.setFromArrayCamera( camera );

\t\t\t} else {

\t\t\t\t_matrix
\t\t\t\t\t.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse )
\t\t\t\t\t.multiply( this.matrixWorld );

\t\t\t\tfrustum.setFromProjectionMatrix(
\t\t\t\t\t_matrix,
\t\t\t\t\tcamera.coordinateSystem,
\t\t\t\t\tcamera.reversedDepth
\t\t\t\t);

\t\t\t}

\t\t}`,
    `\t\tconst instanceInfo = this._instanceInfo;
\t\tconst multiDrawStarts = this._multiDrawStarts;
\t\tconst multiDrawCounts = this._multiDrawCounts;
\t\tconst geometryInfoList = this._geometryInfo;
\t\tconst perObjectFrustumCulled = this.perObjectFrustumCulled;
\t\tconst indirectTexture = this._indirectTexture;
\t\tconst indirectArray = textureData( indirectTexture );

\t\tconst frustum = camera.isArrayCamera ? _frustumArray : _frustum;
\t\t// prepare the frustum in the local frame
\t\tif ( perObjectFrustumCulled ) {

\t\t\tif ( camera.isArrayCamera ) {

\t\t\t\tfrustum.setFromArrayCamera( camera );

\t\t\t} else {

\t\t\t\t_matrix
\t\t\t\t\t.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse )
\t\t\t\t\t.multiply( this.matrixWorld );

\t\t\t\t// \`camera.coordinateSystem\` is typed \`any\` in three's own JSDoc (it
\t\t\t\t// names a value constant as a type); the renderer's own copy of this
\t\t\t\t// same call (WebGLRenderer.js) already hardcodes \`WebGLCoordinateSystem\`
\t\t\t\t// for the same reason -- this is always a WebGL context here too.
\t\t\t\tfrustum.setFromProjectionMatrix(
\t\t\t\t\t_matrix,
\t\t\t\t\tWebGLCoordinateSystem,
\t\t\t\t\tcamera.reversedDepth
\t\t\t\t);

\t\t\t}

\t\t}`,
    fileName,
    'BatchedMesh onBeforeRender native indirect texture read and coordinate system',
  )

  // Each initialization branch already selects its concrete frustum. Avoid
  // taking an optional method from the later union just to call that same
  // known target. The union still serves the common intersectsSphere method.
  transformed = replaceOne(transformed, 'frustum.setFromArrayCamera( camera );',
    '_frustumArray.setFromArrayCamera( camera );', fileName, 'BatchedMesh array frustum initialization')
  transformed = replaceOne(transformed, 'frustum.setFromProjectionMatrix(',
    '_frustum.setFromProjectionMatrix(', fileName, 'BatchedMesh projection frustum initialization')

  // The inherited Object3D.copy contract cannot describe batch-only geometry,
  // textures and bookkeeping. This method copies another BatchedMesh.
  transformed = replaceOne(
    transformed,
    '\tcopy( source ) {',
    '\t/** @param {BatchedMesh} source */\n\tcopy( source ) {',
    fileName,
    'BatchedMesh native copy source contract',
  )

  // JavaScript's missing -1 property is undefined, which cannot equal a numeric
  // ID. State that empty-list case before indexing the native numeric array.
  transformed = replaceOne(
    transformed,
    'while ( availableInstanceIds[ availableInstanceIds.length - 1 ] === instanceInfo.length - 1 ) {',
    'while ( availableInstanceIds.length > 0 && availableInstanceIds[ availableInstanceIds.length - 1 ] === instanceInfo.length - 1 ) {',
    fileName,
    'BatchedMesh empty recycled instance list guard',
  )

  return transformed

}

/**
 * Rewrites the `object.isBatchedMesh` branch in `renderers/WebGLRenderer.js`.
 * The base plugin currently stubs that branch to throw (see
 * `native-webgl-angle/geatsc-plugin.mjs`, "WebGLRenderer batched mesh
 * unsupported") because referencing `BatchedMesh`'s type from there used to
 * pull its still-boxed body into the program. This experimental typed branch
 * is exported so a probe (or, after native validation, the base plugin) can apply
 * the exact same text without duplicating it.
 *
 * @param {string} transformed
 * @param {string} fileName
 * @param {(text: string, before: string, after: string, fileName: string, description: string) => string} replaceOne
 * @return {string}
 */
export function transformBatchedRendererBranch( transformed, fileName, replaceOne ) {

  return replaceOne(
    transformed,
    `\t\t\tif ( object.isBatchedMesh ) {\n\n\t\t\t\tthrow new Error( 'THREE.WebGLRenderer: BatchedMesh is not supported by the native target.' );\n\n\t\t\t}`,
    `\t\t\tif ( object.isBatchedMesh ) {\n\n\t\t\t\tconst batchedObject = /** @type {import('../objects/BatchedMesh.js').BatchedMesh} */ ( object );\n\n\t\t\t\tp_uniforms.setValue( _gl, 'batchingTexture', batchedObject._matricesTexture, textures );\n\n\t\t\t\tp_uniforms.setValue( _gl, 'batchingIdTexture', batchedObject._indirectTexture, textures );\n\n\t\t\t\tif ( batchedObject._colorsTexture !== null ) {\n\n\t\t\t\t\tp_uniforms.setValue( _gl, 'batchingColorTexture', batchedObject._colorsTexture, textures );\n\n\t\t\t\t}\n\n\t\t\t}`,
    fileName,
    'WebGLRenderer batched mesh typed uniform branch',
  )

}

// Native renderer validation must exercise onBeforeRender/onBeforeShadow
// through Object3D references. JavaScript behavior tests cannot establish that
// the compiler preserves those overrides. A certification refusal earlier in
// the pipeline is also not evidence of a dispatch defect. Keep the normal
// plugin's unsupported guard until both native execution and dispatch pass.
