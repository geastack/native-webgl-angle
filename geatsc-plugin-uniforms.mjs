// The native model of three's shader uniforms.
//
// three types a uniform set as `Object`: `{ name: { value: anything } }`, filled
// by a generic `for`-`in` shape copy (`cloneUniforms`) and read back by name in
// a dozen renderer modules and by string id in `WebGLUniforms.upload`. Compiled
// as written, that is a dictionary of boxed values and every read of a uniform
// is an unbox -- the exact carrier this build refuses. Stated once here instead:
//
// - `NativeUniformValue` is one DISJOINT union of every value a uniform holds
//   in three's own renderer: the math classes the setters test for
//   (`v.x !== undefined` is a Vector, `v.r` a Color, `v.elements` a Matrix --
//   they narrow with `instanceof` here), textures, the flat numeric arrays,
//   and the light-uniform arrays. Each arm is a distinct native carrier, so a
//   slot is one tagged union and every consumer narrows it natively.
// - `NativeUniformSlot` is `{ value, needsUpdate? }` and `NativeUniforms` the
//   string-keyed table of slots -- one type for a ShaderLib template, a merged
//   material set, a `ShaderMaterial`'s own custom uniforms and the property
//   bag the renderer keeps per material, which is what lets `cloneUniforms`
//   and `mergeUniforms` stay the generic `for`-`in` copies three wrote.
// - The light-uniform records `WebGLLights` caches are CLASSES, so an
//   `instanceof` can tell them apart inside a union (a structural record
//   cannot be told from another one with the same fields at runtime).
//
// The typedefs live in `UniformsLib.js`, the root of the chain; every other
// module aliases them through `import()` types.

const glContext = "import('@geastack/native-webgl-angle/nativeWebGL').NativeWebGL2RenderingContext"
const glHandle = "import('@geastack/native-webgl-angle/nativeWebGL').NativeHandle"

export const nativeLightUniformClassNames = [
  'NativeDirectionalLightUniform',
  'NativeSpotLightUniform',
  'NativePointLightUniform',
  'NativeHemisphereLightUniform',
  'NativeRectAreaLightUniform',
  'NativeShadowUniform',
  'NativePointShadowUniform',
]

/**
 * The JSDoc typedef block injected into `UniformsLib.js`, after the light
 * uniform classes it names.
 */
export const nativeUniformTypedefs = `/**
 * Every value a shader uniform slot can hold, as ONE disjoint union: the math
 * classes three's setters duck-type (\`v.x\`, \`v.r\`, \`v.elements\`), textures,
 * the flat numeric arrays, and the light-uniform arrays \`WebGLLights\` builds.
 * A slot is therefore one native tagged union, and every consumer narrows it
 * with \`instanceof\`/\`typeof\`/\`Array.isArray\` instead of reading a box.
 * @typedef {number|boolean|null|undefined
 *   |import('../../math/Color.js').Color
 *   |import('../../math/Vector2.js').Vector2
 *   |import('../../math/Vector3.js').Vector3
 *   |import('../../math/Vector4.js').Vector4
 *   |import('../../math/Matrix2.js').Matrix2
 *   |import('../../math/Matrix3.js').Matrix3
 *   |import('../../math/Matrix4.js').Matrix4
 *   |import('../../textures/Texture.js').Texture
 *   |number[]|Float32Array|Int32Array|Uint32Array
 *   |Array<import('../../math/Vector3.js').Vector3>
 *   |Array<import('../../math/Matrix4.js').Matrix4>
 *   |Array<import('../../textures/Texture.js').Texture|null>
${nativeLightUniformClassNames.map((name) => ` *   |${name}|${name}[]`).join('\n')}
 * } NativeUniformValue
 * @typedef {{ value: NativeUniformValue, needsUpdate?: boolean }} NativeUniformSlot
 * @typedef {Record<string, NativeUniformSlot>} NativeUniforms
 */`

/**
 * The classes that replace `WebGLLights`' light-uniform literals. Field names,
 * order and defaults are three's own (`UniformsCache`/`ShadowUniformsCache`).
 * `NativePointShadowUniform` deliberately does NOT extend `NativeShadowUniform`:
 * an inheritance edge would make the two array arms of `NativeUniformValue`
 * subtype-related, and the union's arms must stay disjoint. They live in
 * `UniformsLib.js`, the root of the import graph, so `WebGLLights` and
 * `WebGLUniforms` both reach them without a cycle.
 */
export const nativeLightUniformClasses = `export class NativeDirectionalLightUniform {

\tconstructor() {

\t\tthis.direction = new Vector3();
\t\tthis.color = new Color();

\t}

}

export class NativeSpotLightUniform {

\tconstructor() {

\t\tthis.position = new Vector3();
\t\tthis.direction = new Vector3();
\t\tthis.color = new Color();
\t\tthis.distance = 0;
\t\tthis.coneCos = 0;
\t\tthis.penumbraCos = 0;
\t\tthis.decay = 0;

\t}

}

export class NativePointLightUniform {

\tconstructor() {

\t\tthis.position = new Vector3();
\t\tthis.color = new Color();
\t\tthis.distance = 0;
\t\tthis.decay = 0;

\t}

}

export class NativeHemisphereLightUniform {

\tconstructor() {

\t\tthis.direction = new Vector3();
\t\tthis.skyColor = new Color();
\t\tthis.groundColor = new Color();

\t}

}

export class NativeRectAreaLightUniform {

\tconstructor() {

\t\tthis.color = new Color();
\t\tthis.position = new Vector3();
\t\tthis.halfWidth = new Vector3();
\t\tthis.halfHeight = new Vector3();

\t}

}

export class NativeShadowUniform {

\tconstructor() {

\t\tthis.shadowIntensity = 1;
\t\tthis.shadowBias = 0;
\t\tthis.shadowNormalBias = 0;
\t\tthis.shadowRadius = 1;
\t\tthis.shadowMapSize = new Vector2();

\t}

}

export class NativePointShadowUniform {

\tconstructor() {

\t\tthis.shadowIntensity = 1;
\t\tthis.shadowBias = 0;
\t\tthis.shadowNormalBias = 0;
\t\tthis.shadowRadius = 1;
\t\tthis.shadowMapSize = new Vector2();
\t\tthis.shadowCameraNear = 1;
\t\tthis.shadowCameraFar = 1000;

\t}

}

/** @typedef {NativeDirectionalLightUniform|NativeSpotLightUniform|NativePointLightUniform|NativeHemisphereLightUniform|NativeRectAreaLightUniform} NativeLightUniform */
/** @typedef {NativeShadowUniform|NativePointShadowUniform} NativeLightShadowUniform */
`

/**
 * `WebGLLights`' two uniform caches over the classes, replacing three's
 * literal-building `UniformsCache`/`ShadowUniformsCache`, plus the
 * `instanceof` reads the light loops use where three trusted `light.type`.
 * Plain functions, not `new`-called ones: three's return an object literal
 * out of a `new` expression, which is a construct thunk for nothing.
 */
export const nativeLightUniformCaches = `/** @typedef {import('../shaders/UniformsLib.js').NativeLightUniform} NativeLightUniform */
/** @typedef {import('../shaders/UniformsLib.js').NativeLightShadowUniform} NativeLightShadowUniform */

${['NativeDirectionalLightUniform', 'NativeSpotLightUniform', 'NativePointLightUniform', 'NativeHemisphereLightUniform', 'NativeRectAreaLightUniform']
  .map(
    (name) => `/** @param {NativeLightUniform} uniforms @return {${name}} */
function require${name}( uniforms ) {

\tif ( uniforms instanceof ${name} ) return uniforms;

\tthrow new Error( 'THREE.WebGLLights: light uniforms are not a ${name}.' );

}`,
  )
  .join('\n\n')}

${['NativeShadowUniform', 'NativePointShadowUniform']
  .map(
    (name) => `/** @param {NativeLightShadowUniform} uniforms @return {${name}} */
function require${name}( uniforms ) {

\tif ( uniforms instanceof ${name} ) return uniforms;

\tthrow new Error( 'THREE.WebGLLights: shadow uniforms are not a ${name}.' );

}`,
  )
  .join('\n\n')}

function UniformsCache() {

\t/** @type {Map<number, NativeLightUniform>} */
\tconst lights = new Map();

\treturn {

\t\t/** @param {import('../../lights/Light.js').Light} light @return {NativeLightUniform} */
\t\tget: function ( light ) {

\t\t\tconst cached = lights.get( light.id );

\t\t\tif ( cached !== undefined ) return cached;

\t\t\t/** @type {NativeLightUniform} */
\t\t\tlet uniforms;

\t\t\tswitch ( light.type ) {

\t\t\t\tcase 'DirectionalLight':
\t\t\t\t\tuniforms = new NativeDirectionalLightUniform();
\t\t\t\t\tbreak;

\t\t\t\tcase 'SpotLight':
\t\t\t\t\tuniforms = new NativeSpotLightUniform();
\t\t\t\t\tbreak;

\t\t\t\tcase 'PointLight':
\t\t\t\t\tuniforms = new NativePointLightUniform();
\t\t\t\t\tbreak;

\t\t\t\tcase 'HemisphereLight':
\t\t\t\t\tuniforms = new NativeHemisphereLightUniform();
\t\t\t\t\tbreak;

\t\t\t\tcase 'RectAreaLight':
\t\t\t\t\tuniforms = new NativeRectAreaLightUniform();
\t\t\t\t\tbreak;

\t\t\t\tdefault:
\t\t\t\t\tthrow new Error( 'THREE.WebGLLights: no uniforms for light type ' + light.type + '.' );

\t\t\t}

\t\t\tlights.set( light.id, uniforms );

\t\t\treturn uniforms;

\t\t}

\t};

}

function ShadowUniformsCache() {

\t/** @type {Map<number, NativeLightShadowUniform>} */
\tconst lights = new Map();

\treturn {

\t\t/** @param {import('../../lights/Light.js').Light} light @return {NativeLightShadowUniform} */
\t\tget: function ( light ) {

\t\t\tconst cached = lights.get( light.id );

\t\t\tif ( cached !== undefined ) return cached;

\t\t\t/** @type {NativeLightShadowUniform} */
\t\t\tlet uniforms;

\t\t\tswitch ( light.type ) {

\t\t\t\tcase 'DirectionalLight':
\t\t\t\t\tuniforms = new NativeShadowUniform();
\t\t\t\t\tbreak;

\t\t\t\tcase 'SpotLight':
\t\t\t\t\tuniforms = new NativeShadowUniform();
\t\t\t\t\tbreak;

\t\t\t\tcase 'PointLight':
\t\t\t\t\tuniforms = new NativePointShadowUniform();
\t\t\t\t\tbreak;

\t\t\t\tdefault:
\t\t\t\t\tthrow new Error( 'THREE.WebGLLights: no shadow uniforms for light type ' + light.type + '.' );

\t\t\t}

\t\t\tlights.set( light.id, uniforms );

\t\t\treturn uniforms;

\t\t}

\t};

}
`

/**
 * `UniformsUtils.js`, typed: the same two `for`-`in` copies three wrote, over
 * `NativeUniforms`, plus the per-arm clone and the narrowing accessors every
 * consumer of a slot uses in place of `uniforms.x.value.method()`.
 */
export const nativeUniformsUtilsSource = `import { ColorManagement } from '../../math/ColorManagement.js';
import { warn } from '../../utils.js';
import { Color } from '../../math/Color.js';
import { Matrix3 } from '../../math/Matrix3.js';
import { Matrix4 } from '../../math/Matrix4.js';
import { Vector2 } from '../../math/Vector2.js';
import { Vector3 } from '../../math/Vector3.js';
import { Vector4 } from '../../math/Vector4.js';
import { Texture } from '../../textures/Texture.js';

/** @typedef {import('./UniformsLib.js').NativeUniformValue} NativeUniformValue */
/** @typedef {import('./UniformsLib.js').NativeUniformSlot} NativeUniformSlot */
/** @typedef {import('./UniformsLib.js').NativeUniforms} NativeUniforms */

/**
 * The array guards claim an arm only from a NON-EMPTY first element: an empty
 * array of one arm is indistinguishable at runtime from an empty array of any
 * other, and a guard that claimed \`number[]\` for an empty \`Vector3[]\` would
 * make the compiler unwrap the wrong arm. Empty arrays therefore fall through
 * every guard and are returned as they are.
 */

/** @param {NativeUniformValue} value @return {value is number[]} */
export function isUniformNumberArray( value ) {

\treturn Array.isArray( value ) && value.length > 0 && typeof value[ 0 ] === 'number';

}

/** @param {NativeUniformValue} value @return {value is Vector3[]} */
function isVector3Array( value ) {

\treturn Array.isArray( value ) && value.length > 0 && value[ 0 ] instanceof Vector3;

}

/** @param {NativeUniformValue} value @return {value is Matrix4[]} */
function isMatrix4Array( value ) {

\treturn Array.isArray( value ) && value.length > 0 && value[ 0 ] instanceof Matrix4;

}

/** @param {NativeUniformValue} value @return {value is Array<Texture|null>} */
export function isUniformTextureArray( value ) {

\tif ( ! Array.isArray( value ) || value.length === 0 ) return false;

\tconst first = value[ 0 ];

\treturn first === null || first instanceof Texture;

}

/**
 * One uniform value, deep-copied the way three's \`cloneUniforms\` copies it: a
 * three object is \`clone()\`d (a render-target texture cannot be and becomes
 * null, with three's own warning), an array of three objects clones each
 * element, a numeric array is sliced, and anything else is shared. The light
 * uniform arrays and typed arrays are shared too -- three shares a typed
 * array as well, and the light arrays only ever exist empty in a template
 * and are replaced wholesale by the renderer every frame, never appended to.
 * @param {NativeUniformValue} value
 * @return {NativeUniformValue}
 */
export function cloneUniformValue( value ) {

\tif ( value instanceof Texture ) {

\t\tif ( value.isRenderTargetTexture ) {

\t\t\twarn( 'UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().' );
\t\t\treturn null;

\t\t}

\t\treturn value.clone();

\t}

\tif ( value instanceof Color ) return value.clone();
\tif ( value instanceof Vector2 ) return value.clone();
\tif ( value instanceof Vector3 ) return value.clone();
\tif ( value instanceof Vector4 ) return value.clone();
\tif ( value instanceof Matrix3 ) return value.clone();
\tif ( value instanceof Matrix4 ) return value.clone();

\tif ( isUniformNumberArray( value ) ) return value.slice();

\tif ( isVector3Array( value ) ) {

\t\t/** @type {Vector3[]} */
\t\tconst cloned = [];

\t\tfor ( let i = 0, l = value.length; i < l; i ++ ) cloned.push( value[ i ].clone() );

\t\treturn cloned;

\t}

\tif ( isMatrix4Array( value ) ) {

\t\t/** @type {Matrix4[]} */
\t\tconst cloned = [];

\t\tfor ( let i = 0, l = value.length; i < l; i ++ ) cloned.push( value[ i ].clone() );

\t\treturn cloned;

\t}

\tif ( isUniformTextureArray( value ) ) {

\t\t/** @type {Array<Texture|null>} */
\t\tconst cloned = [];

\t\tfor ( let i = 0, l = value.length; i < l; i ++ ) {

\t\t\tconst texture = value[ i ];
\t\t\tcloned.push( texture === null ? null : texture.clone() );

\t\t}

\t\treturn cloned;

\t}

\treturn value;

}

/**
 * Clones the given uniform definitions by performing a deep-copy. That means
 * if the value of a uniform refers to an object like a Vector3 or Texture,
 * the cloned uniform will refer to a new object reference.
 *
 * @param {NativeUniforms} src - An object representing uniform definitions.
 * @return {NativeUniforms} The cloned uniforms.
 */
export function cloneUniforms( src ) {

\t/** @type {NativeUniforms} */
\tconst dst = {};

\tfor ( const u in src ) {

\t\tconst uniform = src[ u ];

\t\t/** @type {NativeUniformSlot} */
\t\tconst cloned = { value: cloneUniformValue( uniform.value ) };

\t\tif ( uniform.needsUpdate !== undefined ) cloned.needsUpdate = uniform.needsUpdate;

\t\tdst[ u ] = cloned;

\t}

\treturn dst;

}

/**
 * Merges the given uniform definitions into a single object. Since the
 * method internally uses cloneUniforms(), it performs a deep-copy when
 * producing the merged uniform definitions.
 *
 * @param {NativeUniforms[]} uniforms - An array of uniform definitions.
 * @return {NativeUniforms} The merged uniforms.
 */
export function mergeUniforms( uniforms ) {

\t/** @type {NativeUniforms} */
\tconst merged = {};

\tfor ( let u = 0; u < uniforms.length; u ++ ) {

\t\tconst tmp = cloneUniforms( uniforms[ u ] );

\t\tfor ( const p in tmp ) {

\t\t\tmerged[ p ] = tmp[ p ];

\t\t}

\t}

\treturn merged;

}

/**
 * The narrowing reads. three writes \`uniforms.diffuse.value.copy( c )\`,
 * trusting the shader template to have put a Color there; these say the same
 * thing about the union and refuse loudly when the template did not.
 */

/** @param {NativeUniformSlot} uniform @return {Color} */
export function uniformColor( uniform ) {

\tconst value = uniform.value;

\tif ( value instanceof Color ) return value;

\tthrow new Error( 'UniformsUtils: uniform does not hold a Color.' );

}

/** @param {NativeUniformSlot} uniform @return {Vector2} */
export function uniformVector2( uniform ) {

\tconst value = uniform.value;

\tif ( value instanceof Vector2 ) return value;

\tthrow new Error( 'UniformsUtils: uniform does not hold a Vector2.' );

}

/** @param {NativeUniformSlot} uniform @return {Vector3} */
export function uniformVector3( uniform ) {

\tconst value = uniform.value;

\tif ( value instanceof Vector3 ) return value;

\tthrow new Error( 'UniformsUtils: uniform does not hold a Vector3.' );

}

/** @param {NativeUniformSlot} uniform @return {Matrix3} */
export function uniformMatrix3( uniform ) {

\tconst value = uniform.value;

\tif ( value instanceof Matrix3 ) return value;

\tthrow new Error( 'UniformsUtils: uniform does not hold a Matrix3.' );

}

/** @param {NativeUniformSlot} uniform @return {Texture|null} */
export function uniformTexture( uniform ) {

\tconst value = uniform.value;

\tif ( value instanceof Texture ) return value;
\tif ( value === null || value === undefined ) return null;

\tthrow new Error( 'UniformsUtils: uniform does not hold a Texture.' );

}

/**
 * Clones the given uniform groups by performing a deep-copy.
 *
 * @param {Array<import('../../core/UniformsGroup.js').UniformsGroup>} src - An array of uniform groups.
 * @return {Array<import('../../core/UniformsGroup.js').UniformsGroup>} The cloned uniform groups.
 */
export function cloneUniformsGroups( src ) {

\t/** @type {Array<import('../../core/UniformsGroup.js').UniformsGroup>} */
\tconst dst = [];

\tfor ( let u = 0; u < src.length; u ++ ) {

\t\tdst.push( src[ u ].clone() );

\t}

\treturn dst;

}

/**
 * Returns a color space that is appropriate for the unlit uniform color.
 *
 * @param {InstanceType<typeof import('../WebGLRenderer.js').WebGLRenderer>} renderer - The renderer.
 * @return {string} The color space.
 */
export function getUnlitUniformColorSpace( renderer ) {

\tconst currentRenderTarget = renderer.getRenderTarget();

\tif ( currentRenderTarget === null ) {

\t\t// https://github.com/mrdoob/three.js/pull/23937#issuecomment-1111067398
\t\treturn renderer.getOutputColorSpace();

\t}

\t// https://github.com/mrdoob/three.js/issues/27868
\tif ( currentRenderTarget.isXRRenderTarget === true ) {

\t\treturn currentRenderTarget.texture.colorSpace;

\t}

\treturn ColorManagement.workingColorSpace;

}

// Legacy

const UniformsUtils = { clone: cloneUniforms, merge: mergeUniforms };

export { UniformsUtils };
`

/**
 * Rewrite every `<receiver>.uniforms.<name>.value.<method>(` into the narrowing
 * accessor for that uniform's declared type. Fails on any `.value.` method
 * call the map does not name, so a new site cannot silently stay a boxed read.
 * @param {string} text
 * @param {string} fileName
 * @param {Record<string, string>} accessorByUniform
 */
export const rewriteUniformValueMethods = (text, fileName, accessorByUniform) => {
  const rewritten = text.replace(/([\w.]*uniforms)\.(\w+)\.value\./g, (match, receiver, name) => {
    const accessor = accessorByUniform[name]
    if (accessor === undefined) throw new Error(`Three uniform '${name}' at ${fileName} is read as a method receiver but has no native accessor`)
    return `${accessor}( ${receiver}.${name} ).`
  })
  const left = /[\w.]*uniforms\.\w+\.value\./.exec(rewritten)
  if (left !== null) throw new Error(`Three uniform value method call at ${fileName} was not rewritten: ${left[0]}`)
  return rewritten
}

const setterHeader = (receiver) => `/** @this {${receiver}} @param {${glContext}} gl @param {NativeUniformValue} v @param {NativeTextures|undefined} textures @return {void} */`

const vectorSetter = (name, size, ctorName, glScalar, glArray, requireArray) => {
  const fields = ['x', 'y', 'z', 'w'].slice(0, size)
  return `${setterHeader('SingleUniform')}
function ${name}( gl, v, textures ) {

\tconst cache = this.cache;

\tif ( v instanceof ${ctorName} ) {

\t\tif ( ${fields.map((field, index) => `cache[ ${index} ] !== v.${field}`).join(' || ')} ) {

\t\t\tgl.${glScalar}( this.addr, ${fields.map((field) => `v.${field}`).join(', ')} );

${fields.map((field, index) => `\t\t\tcache[ ${index} ] = v.${field};`).join('\n')}

\t\t}

\t} else {

\t\tconst flatValue = ${requireArray}( v );

\t\tif ( arraysEqual( cache, flatValue ) ) return;

\t\tgl.${glArray}( this.addr, flatValue );

\t\tcopyArray( cache, flatValue );

\t}

}`
}

const matrixSetter = (name, size, ctorName, glArray, scratch) => `${setterHeader('SingleUniform')}
function ${name}( gl, v, textures ) {

\tconst cache = this.cache;

\tif ( v instanceof ${ctorName} ) {

\t\tconst elements = v.elements;

\t\tif ( arraysEqual( cache, elements ) ) return;

\t\t${scratch}.set( elements );

\t\tgl.${glArray}( this.addr, false, ${scratch} );

\t\tcopyArray( cache, elements );

\t} else {

\t\tconst flatValue = requireFloatUniformArray( v );

\t\tif ( arraysEqual( cache, flatValue ) ) return;

\t\tgl.${glArray}( this.addr, false, flatValue );

\t\tcopyArray( cache, flatValue );

\t}

}`

const scalarSetter = (name, glScalar, booleans) => `${setterHeader('SingleUniform')}
function ${name}( gl, v, textures ) {

\tconst cache = this.cache;
\tconst value = ${booleans ? "typeof v === 'boolean' ? ( v ? 1 : 0 ) : requireUniformNumber( v )" : 'requireUniformNumber( v )'};

\tif ( cache[ 0 ] === value ) return;

\tgl.${glScalar}( this.addr, value );

\tcache[ 0 ] = value;

}`

const textureSetter = (name, setter, empty, shadowAware) => `${setterHeader('SingleUniform')}
function ${name}( gl, v, textures ) {

\tconst manager = requireTextures( textures );
\tconst cache = this.cache;

\tconst unit = manager.allocateTextureUnit();

\tif ( cache[ 0 ] !== unit ) {

\t\tgl.uniform1i( this.addr, unit );
\t\tcache[ 0 ] = unit;

\t}
${
  shadowAware
    ? `
\t/** @type {Texture} */
\tlet emptyTexture2D;

\tif ( this.type === gl.SAMPLER_2D_SHADOW ) {

\t\temptyShadowTexture.compareFunction = manager.isReversedDepthBuffer() ? GreaterEqualCompare : LessEqualCompare;
\t\temptyTexture2D = emptyShadowTexture;

\t} else {

\t\temptyTexture2D = emptyTexture;

\t}

\tmanager.${setter}( uniformTextureOr( v, emptyTexture2D ), unit );
`
    : `
\tmanager.${setter}( uniformTextureOr( v, ${empty} ), unit );
`
}
}`

const flatArraySetter = (name, glArray, requireArray) => `${setterHeader('PureArrayUniform')}
function ${name}( gl, v, textures ) {

\tgl.${glArray}( this.addr, ${requireArray}( v ) );

}`

const flattenedArraySetter = (name, blockSize, glArray, matrix) => `${setterHeader('PureArrayUniform')}
function ${name}( gl, v, textures ) {

\tconst data = flatten( v, this.size, ${blockSize} );

\tgl.${glArray}( this.addr, ${matrix ? 'false, ' : ''}data );

}`

const textureArraySetter = (name, setter, empty, shadowAware) => `${setterHeader('PureArrayUniform')}
function ${name}( gl, v, textures ) {

\tconst manager = requireTextures( textures );
\tconst cache = this.cache;

\tif ( Array.isArray( v ) && v.length === 0 ) {

\t\tconst units = allocTexUnits( manager, 0 );

\t\tif ( ! arraysEqual( cache, units ) ) {

\t\t\tgl.uniform1iv( this.addr, units );
\t\t\tcopyArray( cache, units );

\t\t}

\t\treturn;

\t}

\tconst list = requireTextureArray( v );
\tconst n = list.length;

\tconst units = allocTexUnits( manager, n );

\tif ( ! arraysEqual( cache, units ) ) {

\t\tgl.uniform1iv( this.addr, units );
\t\tcopyArray( cache, units );

\t}
${
  shadowAware
    ? `
\t/** @type {Texture} */
\tlet emptyTexture2D;

\tif ( this.type === gl.SAMPLER_2D_SHADOW ) {

\t\temptyTexture2D = emptyShadowTexture;

\t} else {

\t\temptyTexture2D = emptyTexture;

\t}
`
    : ''
}
\tfor ( let i = 0; i !== n; ++ i ) {

\t\tconst texture = list[ i ];
\t\tmanager.${setter}( texture === null ? ${shadowAware ? 'emptyTexture2D' : empty} : texture, units[ i ] );

\t}

}`

const singularSetterCases = `\t\tcase 0x1406: return setValueV1f; // FLOAT
\t\tcase 0x8b50: return setValueV2f; // _VEC2
\t\tcase 0x8b51: return setValueV3f; // _VEC3
\t\tcase 0x8b52: return setValueV4f; // _VEC4

\t\tcase 0x8b5a: return setValueM2; // _MAT2
\t\tcase 0x8b5b: return setValueM3; // _MAT3
\t\tcase 0x8b5c: return setValueM4; // _MAT4

\t\tcase 0x1404: case 0x8b56: return setValueV1i; // INT, BOOL
\t\tcase 0x8b53: case 0x8b57: return setValueV2i; // _VEC2
\t\tcase 0x8b54: case 0x8b58: return setValueV3i; // _VEC3
\t\tcase 0x8b55: case 0x8b59: return setValueV4i; // _VEC4

\t\tcase 0x1405: return setValueV1ui; // UINT
\t\tcase 0x8dc6: return setValueV2ui; // _VEC2
\t\tcase 0x8dc7: return setValueV3ui; // _VEC3
\t\tcase 0x8dc8: return setValueV4ui; // _VEC4

\t\tcase 0x8b5e: // SAMPLER_2D
\t\tcase 0x8d66: // SAMPLER_EXTERNAL_OES
\t\tcase 0x8dca: // INT_SAMPLER_2D
\t\tcase 0x8dd2: // UNSIGNED_INT_SAMPLER_2D
\t\tcase 0x8b62: // SAMPLER_2D_SHADOW
\t\t\treturn setValueT1;

\t\tcase 0x8b5f: // SAMPLER_3D
\t\tcase 0x8dcb: // INT_SAMPLER_3D
\t\tcase 0x8dd3: // UNSIGNED_INT_SAMPLER_3D
\t\t\treturn setValueT3D1;

\t\tcase 0x8b60: // SAMPLER_CUBE
\t\tcase 0x8dcc: // INT_SAMPLER_CUBE
\t\tcase 0x8dd4: // UNSIGNED_INT_SAMPLER_CUBE
\t\tcase 0x8dc5: // SAMPLER_CUBE_SHADOW
\t\t\treturn setValueT6;

\t\tcase 0x8dc1: // SAMPLER_2D_ARRAY
\t\tcase 0x8dcf: // INT_SAMPLER_2D_ARRAY
\t\tcase 0x8dd7: // UNSIGNED_INT_SAMPLER_2D_ARRAY
\t\tcase 0x8dc4: // SAMPLER_2D_ARRAY_SHADOW
\t\t\treturn setValueT2DArray1;`

const arraySetterCases = singularSetterCases
  .replace(/return setValue(V[1-4](?:f|i|ui)|M[2-4]);/g, 'return setValue$1Array;')
  .replace('return setValueT1;', 'return setValueT1Array;')
  .replace('return setValueT3D1;', 'return setValueT3DArray;')
  .replace('return setValueT6;', 'return setValueT6Array;')
  .replace('return setValueT2DArray1;', 'return setValueT2DArrayArray;')

/**
 * `WebGLUniforms.js`, typed end to end. Same tree, same parser, same setter
 * table and the same per-uniform caches three keeps; the only change is what
 * each setter is handed -- a `NativeUniformValue` it narrows with `instanceof`
 * where three duck-typed `v.x`/`v.r`/`v.elements` -- and how a structured
 * uniform reaches its members, through the light classes instead of `value[ id ]`.
 */
// Fixed renderer names need no owning string parameter. Read the map on every
// call so replacement/deletion retains the same behavior as setValue.
// Build-time comparison switch; emitted code has no runtime branch.
export const nativeUniformNamesEnabled = process.env.GEA_WEBGL_UNIFORM_NAMES !== 'baseline'
export const nativeUniformBindingsEnabled = process.env.GEA_WEBGL_UNIFORM_BINDINGS !== 'baseline'
export const nativeFixedUniforms = [
  ['projectionMatrix', 'Matrix4'],
  ['viewMatrix', 'Matrix4'],
  ['modelViewMatrix', 'Matrix4'],
  ['normalMatrix', 'Matrix3'],
  ['modelMatrix', 'Matrix4'],
  ['toneMappingExposure', 'number'],
  ['cameraPosition', 'Vector3'],
  ...(nativeUniformBindingsEnabled ? [
    ['directionalShadowMap', 'Array<Texture|null>', true],
    ['spotShadowMap', 'Array<Texture|null>', true],
    ['pointShadowMap', 'Array<Texture|null>', true],
  ] : []),
]
const fixedUniformMethods = nativeFixedUniforms.map(([name, type, textures]) => {
  const matrix = type === 'Matrix3' || type === 'Matrix4'
  return `
  /** @param {${glContext}} gl @param {${type}} value ${textures ? '@param {NativeTextures|undefined} textures' : ''} */
  set_${name}( gl, value${textures ? ', textures' : ''} ) {
    const uniform = this.map.${name};
    if ( uniform === undefined ) return;
    ${matrix ? `if ( ! ( uniform instanceof SingleUniform ) ) throw new Error( 'THREE.WebGLUniforms: ${type} fast path requires a single uniform.' );
    setNative${type}UniformValue( uniform, gl, value );` : `setNativeUniformValue( uniform, gl, value, ${textures ? 'textures' : 'undefined'} );`}
  }
`
}).join('\n')


// Uniform nodes belong to the linked program: id/type/location remain fixed
// until relinking constructs new nodes. Cache only the name classification,
// never the material's value cells (which remain replaceable on every upload).
export const nativeUniformBindingNames = [
  'alphaMapTransform', 'ambientLightColor', 'bumpMapTransform',
  'directionalLights', 'directionalLightShadows', 'directionalShadowMap', 'directionalShadowMatrix',
  'displacementMapTransform', 'displacementScale', 'displacementBias',
  'emissiveMapTransform', 'hemisphereLights', 'lightMapIntensity', 'lightMapTransform',
  'metalnessMapTransform', 'normalMapTransform', 'pointLightShadows', 'pointShadowMatrix',
  'probesResolution', 'roughnessMapTransform', 'specularMapTransform', 'spotLightShadows',
];
export const nativeUniformBindingHelpers = `
/** @param {string} id @return {number} */
function nativeUniformBindingSlot( id ) {
  switch ( id ) {
    case 'clippingPlanes': return -1;
${nativeUniformBindingNames.map((name, i) => `    case '${name}': return ${i + 1};`).join('\n')}
    default: return 0;
  }
}
/** @param {NativeUniforms} values @param {NativeUniform} uniform @return {import('../shaders/UniformsLib.js').NativeUniformSlot|undefined} */
function nativeUniformBindingValue( values, uniform ) {
  switch ( uniform.nativeBindingSlot ) {
${nativeUniformBindingNames.map((name, i) => `    case ${i + 1}: return values.${name};`).join('\n')}
    default: return values[ uniform.id ];
  }
}
`;

const optimizedNativeWebGLUniformsSource = `import { CubeTexture } from '../../textures/CubeTexture.js';
import { Texture } from '../../textures/Texture.js';
import { DataArrayTexture } from '../../textures/DataArrayTexture.js';
import { Data3DTexture } from '../../textures/Data3DTexture.js';
import { DepthTexture } from '../../textures/DepthTexture.js';
import { LessEqualCompare, GreaterEqualCompare } from '../../constants.js';
import { WebGLTextures } from './WebGLTextures.js';
import { Color } from '../../math/Color.js';
import { Matrix2 } from '../../math/Matrix2.js';
import { Matrix3 } from '../../math/Matrix3.js';
import { Matrix4 } from '../../math/Matrix4.js';
import { Vector2 } from '../../math/Vector2.js';
import { Vector3 } from '../../math/Vector3.js';
import { Vector4 } from '../../math/Vector4.js';
import { isUniformNumberArray, isUniformTextureArray } from '../shaders/UniformsUtils.js';
import {
${nativeLightUniformClassNames.map((name) => `\t${name},`).join('\n')}
} from '../shaders/UniformsLib.js';

/** @typedef {import('../shaders/UniformsLib.js').NativeUniformValue} NativeUniformValue */
/** @typedef {import('../shaders/UniformsLib.js').NativeUniforms} NativeUniforms */
/** @typedef {InstanceType<typeof WebGLTextures>} NativeTextures */
/** @typedef {{ name: string, type: number, size: number }} NativeActiveUniformInfo */
/** @typedef {SingleUniform|PureArrayUniform|StructuredUniform} NativeUniform */
/** @typedef {{ value: Float32Array|null, needsUpdate: boolean }} NativeClippingUniform */
/** @typedef {number[]|Float32Array} NativeFloatUniformArray */
/** @typedef {number[]|Int32Array} NativeIntUniformArray */
/** @typedef {number[]|Uint32Array} NativeUintUniformArray */
/** @typedef {(this: SingleUniform, gl: ${glContext}, value: NativeUniformValue, textures: NativeTextures|undefined) => void} NativeSingularUniformSetter */
/** @typedef {(this: PureArrayUniform, gl: ${glContext}, value: NativeUniformValue, textures: NativeTextures|undefined) => void} NativeArrayUniformSetter */

const emptyTexture = /*@__PURE__*/ new Texture();
const emptyShadowTexture = /*@__PURE__*/ new DepthTexture( 1, 1 );
const emptyArrayTexture = /*@__PURE__*/ new DataArrayTexture();
const empty3dTexture = /*@__PURE__*/ new Data3DTexture();
const emptyCubeTexture = /*@__PURE__*/ new CubeTexture();

const emptyFloatArray = new Float32Array( 0 );
const emptyIntArray = new Int32Array( 0 );
const emptyUintArray = new Uint32Array( 0 );

// --- Utilities ---

// Array Caches (provide typed arrays for temporary by size)

/** @type {Array<Float32Array|undefined>} */
const arrayCacheF32 = [];
/** @type {Array<Int32Array|undefined>} */
const arrayCacheI32 = [];

// Float32Array caches used for uploading Matrix uniforms

const mat4array = new Float32Array( 16 );
const mat3array = new Float32Array( 9 );
const mat2array = new Float32Array( 4 );

/**
 * The value narrowings. three's setters duck-type their argument (\`v.x\`,
 * \`v.elements\`, \`firstElem <= 0 || firstElem > 0\`); over the union each test
 * is an \`instanceof\`/\`typeof\`, and a value of the wrong arm is a loud error
 * rather than an upload of garbage.
 */

/** @param {NativeUniformValue} value @return {number} */
function requireUniformNumber( value ) {

\tif ( typeof value === 'number' ) return value;

\tthrow new Error( 'THREE.WebGLUniforms: uniform value must be a number.' );

}

/** @param {NativeUniformValue} value @return {NativeFloatUniformArray} */
function requireFloatUniformArray( value ) {

\tif ( value instanceof Float32Array ) return value;
\tif ( isUniformNumberArray( value ) ) return value;
\tif ( Array.isArray( value ) && value.length === 0 ) return emptyFloatArray;

\tthrow new Error( 'THREE.WebGLUniforms: Float uniform value must be a number array or Float32Array.' );

}

/** @param {NativeUniformValue} value @return {NativeIntUniformArray} */
function requireIntUniformArray( value ) {

\tif ( value instanceof Int32Array ) return value;
\tif ( isUniformNumberArray( value ) ) return value;
\tif ( Array.isArray( value ) && value.length === 0 ) return emptyIntArray;

\tthrow new Error( 'THREE.WebGLUniforms: Integer uniform value must be a number array or Int32Array.' );

}

/** @param {NativeUniformValue} value @return {NativeUintUniformArray} */
function requireUintUniformArray( value ) {

\tif ( value instanceof Uint32Array ) return value;
\tif ( isUniformNumberArray( value ) ) return value;
\tif ( Array.isArray( value ) && value.length === 0 ) return emptyUintArray;

\tthrow new Error( 'THREE.WebGLUniforms: Unsigned integer uniform value must be a number array or Uint32Array.' );

}

/** @param {NativeUniformValue} value @return {Array<Texture|null>} */
function requireTextureArray( value ) {

\tif ( isUniformTextureArray( value ) ) return value;

\tthrow new Error( 'THREE.WebGLUniforms: sampler array uniform value must be an array of textures.' );

}

/** @param {NativeUniformValue} value @param {Texture} fallback @return {Texture} */
function uniformTextureOr( value, fallback ) {

\tif ( value instanceof Texture ) return value;
\tif ( value === null || value === undefined || value === false ) return fallback;

\tthrow new Error( 'THREE.WebGLUniforms: sampler uniform value must be a texture.' );

}

/** @param {NativeTextures|undefined} textures @return {NativeTextures} */
function requireTextures( textures ) {

\tif ( textures === undefined ) throw new Error( 'THREE.WebGLUniforms: sampler uniforms need the texture manager.' );

\treturn textures;

}

/**
 * One element of an object array, written into the flat upload buffer. three
 * calls \`element.toArray( r, offset )\` on whatever the element is; over the
 * union the element is narrowed to the classes that have a fixed layout.
 * @param {NativeUniformValue} value @param {Float32Array} target @param {number} offset @param {number} blockSize
 */
function copyUniformElement( value, target, offset, blockSize ) {

\tif ( value instanceof Matrix2 ) {

\t\tif ( blockSize !== 4 ) throw new Error( 'THREE.WebGLUniforms: Matrix2 block size mismatch.' );
\t\tfor ( let i = 0; i < 4; i ++ ) target[ offset + i ] = value.elements[ i ];
\t\treturn;

\t}

\tif ( value instanceof Matrix3 ) {

\t\tif ( blockSize !== 9 ) throw new Error( 'THREE.WebGLUniforms: Matrix3 block size mismatch.' );
\t\tfor ( let i = 0; i < 9; i ++ ) target[ offset + i ] = value.elements[ i ];
\t\treturn;

\t}

\tif ( value instanceof Matrix4 ) {

\t\tif ( blockSize !== 16 ) throw new Error( 'THREE.WebGLUniforms: Matrix4 block size mismatch.' );
\t\tfor ( let i = 0; i < 16; i ++ ) target[ offset + i ] = value.elements[ i ];
\t\treturn;

\t}

\tif ( value instanceof Color ) {

\t\tif ( blockSize !== 3 ) throw new Error( 'THREE.WebGLUniforms: Color block size mismatch.' );
\t\ttarget[ offset ] = value.r;
\t\ttarget[ offset + 1 ] = value.g;
\t\ttarget[ offset + 2 ] = value.b;
\t\treturn;

\t}

\tif ( value instanceof Vector2 ) {

\t\tif ( blockSize !== 2 ) throw new Error( 'THREE.WebGLUniforms: Vector2 block size mismatch.' );
\t\ttarget[ offset ] = value.x;
\t\ttarget[ offset + 1 ] = value.y;
\t\treturn;

\t}

\tif ( value instanceof Vector3 ) {

\t\tif ( blockSize !== 3 ) throw new Error( 'THREE.WebGLUniforms: Vector3 block size mismatch.' );
\t\ttarget[ offset ] = value.x;
\t\ttarget[ offset + 1 ] = value.y;
\t\ttarget[ offset + 2 ] = value.z;
\t\treturn;

\t}

\tif ( value instanceof Vector4 ) {

\t\tif ( blockSize !== 4 ) throw new Error( 'THREE.WebGLUniforms: Vector4 block size mismatch.' );
\t\ttarget[ offset ] = value.x;
\t\ttarget[ offset + 1 ] = value.y;
\t\ttarget[ offset + 2 ] = value.z;
\t\ttarget[ offset + 3 ] = value.w;
\t\treturn;

\t}

\tthrow new Error( 'THREE.WebGLUniforms: uniform array element has no flat layout.' );

}

// Flattening for arrays of vectors and matrices

/** @param {NativeUniformValue} array @param {number} nBlocks @param {number} blockSize @return {NativeFloatUniformArray} */
function flatten( array, nBlocks, blockSize ) {

\tif ( array instanceof Float32Array ) return array;
\tif ( isUniformNumberArray( array ) ) return array;

\tconst n = nBlocks * blockSize;
\tlet r = arrayCacheF32[ n ];

\tif ( r === undefined ) {

\t\tr = new Float32Array( n );
\t\tarrayCacheF32[ n ] = r;

\t}

\tif ( nBlocks !== 0 ) {

\t\tif ( ! Array.isArray( array ) ) throw new Error( 'THREE.WebGLUniforms: uniform array value must be an array.' );

\t\tlet offset = 0;

\t\tfor ( let i = 0; i !== nBlocks; ++ i ) {

\t\t\tcopyUniformElement( array[ i ], r, offset, blockSize );
\t\t\toffset += blockSize;

\t\t}

\t}

\treturn r;

}

/** @param {number[]} a @param {number[]|Float32Array|Int32Array|Uint32Array} b */
function arraysEqual( a, b ) {

\tif ( a.length !== b.length ) return false;

\tfor ( let i = 0, l = a.length; i < l; i ++ ) {

\t\tif ( a[ i ] !== b[ i ] ) return false;

\t}

\treturn true;

}

/** @param {number[]} a @param {number[]|Float32Array|Int32Array|Uint32Array} b */
function copyArray( a, b ) {

\ta.length = b.length;

\tfor ( let i = 0, l = b.length; i < l; i ++ ) {

\t\ta[ i ] = b[ i ];

\t}

}

// Texture unit allocation

/** @param {NativeTextures} textures @param {number} n @return {Int32Array} */
function allocTexUnits( textures, n ) {

\tlet r = arrayCacheI32[ n ];

\tif ( r === undefined ) {

\t\tr = new Int32Array( n );
\t\tarrayCacheI32[ n ] = r;

\t}

\tfor ( let i = 0; i !== n; ++ i ) {

\t\tr[ i ] = textures.allocateTextureUnit();

\t}

\treturn r;

}

// --- Setters ---

// Note: Defining these methods externally, because they come in a bunch
// and this way their names minify.

// Single scalar

${scalarSetter('setValueV1f', 'uniform1f', false)}

// Single float vector (from flat array or THREE.VectorN)

${vectorSetter('setValueV2f', 2, 'Vector2', 'uniform2f', 'uniform2fv', 'requireFloatUniformArray')}

${setterHeader('SingleUniform')}
function setValueV3f( gl, v, textures ) {

\tconst cache = this.cache;

\tif ( v instanceof Vector3 ) {

\t\tif ( cache[ 0 ] !== v.x || cache[ 1 ] !== v.y || cache[ 2 ] !== v.z ) {

\t\t\tgl.uniform3f( this.addr, v.x, v.y, v.z );

\t\t\tcache[ 0 ] = v.x;
\t\t\tcache[ 1 ] = v.y;
\t\t\tcache[ 2 ] = v.z;

\t\t}

\t} else if ( v instanceof Color ) {

\t\tif ( cache[ 0 ] !== v.r || cache[ 1 ] !== v.g || cache[ 2 ] !== v.b ) {

\t\t\tgl.uniform3f( this.addr, v.r, v.g, v.b );

\t\t\tcache[ 0 ] = v.r;
\t\t\tcache[ 1 ] = v.g;
\t\t\tcache[ 2 ] = v.b;

\t\t}

\t} else {

\t\tconst flatValue = requireFloatUniformArray( v );

\t\tif ( arraysEqual( cache, flatValue ) ) return;

\t\tgl.uniform3fv( this.addr, flatValue );

\t\tcopyArray( cache, flatValue );

\t}

}

${vectorSetter('setValueV4f', 4, 'Vector4', 'uniform4f', 'uniform4fv', 'requireFloatUniformArray')}

// Single matrix (from flat array or THREE.MatrixN)

${matrixSetter('setValueM2', 2, 'Matrix2', 'uniformMatrix2fv', 'mat2array')}

${matrixSetter('setValueM3', 3, 'Matrix3', 'uniformMatrix3fv', 'mat3array')}

${matrixSetter('setValueM4', 4, 'Matrix4', 'uniformMatrix4fv', 'mat4array')}

// Single integer / boolean

${scalarSetter('setValueV1i', 'uniform1i', true)}

// Single integer / boolean vector (from flat array or THREE.VectorN)

${vectorSetter('setValueV2i', 2, 'Vector2', 'uniform2i', 'uniform2iv', 'requireIntUniformArray')}

${vectorSetter('setValueV3i', 3, 'Vector3', 'uniform3i', 'uniform3iv', 'requireIntUniformArray')}

${vectorSetter('setValueV4i', 4, 'Vector4', 'uniform4i', 'uniform4iv', 'requireIntUniformArray')}

// Single unsigned integer

${scalarSetter('setValueV1ui', 'uniform1ui', true)}

// Single unsigned integer vector (from flat array or THREE.VectorN)

${vectorSetter('setValueV2ui', 2, 'Vector2', 'uniform2ui', 'uniform2uiv', 'requireUintUniformArray')}

${vectorSetter('setValueV3ui', 3, 'Vector3', 'uniform3ui', 'uniform3uiv', 'requireUintUniformArray')}

${vectorSetter('setValueV4ui', 4, 'Vector4', 'uniform4ui', 'uniform4uiv', 'requireUintUniformArray')}

// Single texture (2D / Cube)

${textureSetter('setValueT1', 'setTexture2D', 'emptyTexture', true)}

${textureSetter('setValueT3D1', 'setTexture3D', 'empty3dTexture', false)}

${textureSetter('setValueT6', 'setTextureCube', 'emptyCubeTexture', false)}

${textureSetter('setValueT2DArray1', 'setTexture2DArray', 'emptyArrayTexture', false)}

// Helper to pick the right setter for the singular case

/** @param {number} type @return {NativeSingularUniformSetter} */
function getSingularSetter( type ) {

\tswitch ( type ) {

${singularSetterCases}

\t}

\tthrow new Error( 'THREE.WebGLUniforms: Unsupported singular uniform type.' );

}

// Array of scalars

${flatArraySetter('setValueV1fArray', 'uniform1fv', 'requireFloatUniformArray')}

// Array of vectors (from flat array or array of THREE.VectorN)

${flattenedArraySetter('setValueV2fArray', 2, 'uniform2fv', false)}

${flattenedArraySetter('setValueV3fArray', 3, 'uniform3fv', false)}

${flattenedArraySetter('setValueV4fArray', 4, 'uniform4fv', false)}

// Array of matrices (from flat array or array of THREE.MatrixN)

${flattenedArraySetter('setValueM2Array', 4, 'uniformMatrix2fv', true)}

${flattenedArraySetter('setValueM3Array', 9, 'uniformMatrix3fv', true)}

${flattenedArraySetter('setValueM4Array', 16, 'uniformMatrix4fv', true)}

// Array of integer / boolean

${flatArraySetter('setValueV1iArray', 'uniform1iv', 'requireIntUniformArray')}

// Array of integer / boolean vectors (from flat array)

${flatArraySetter('setValueV2iArray', 'uniform2iv', 'requireIntUniformArray')}

${flatArraySetter('setValueV3iArray', 'uniform3iv', 'requireIntUniformArray')}

${flatArraySetter('setValueV4iArray', 'uniform4iv', 'requireIntUniformArray')}

// Array of unsigned integer

${flatArraySetter('setValueV1uiArray', 'uniform1uiv', 'requireUintUniformArray')}

// Array of unsigned integer vectors (from flat array)

${flatArraySetter('setValueV2uiArray', 'uniform2uiv', 'requireUintUniformArray')}

${flatArraySetter('setValueV3uiArray', 'uniform3uiv', 'requireUintUniformArray')}

${flatArraySetter('setValueV4uiArray', 'uniform4uiv', 'requireUintUniformArray')}

// Array of textures (2D / 3D / Cube / 2DArray)

${textureArraySetter('setValueT1Array', 'setTexture2D', 'emptyTexture', true)}

${textureArraySetter('setValueT3DArray', 'setTexture3D', 'empty3dTexture', false)}

${textureArraySetter('setValueT6Array', 'setTextureCube', 'emptyCubeTexture', false)}

${textureArraySetter('setValueT2DArrayArray', 'setTexture2DArray', 'emptyArrayTexture', false)}

// Helper to pick the right setter for a pure (bottom-level) array

/** @param {number} type @return {NativeArrayUniformSetter} */
function getPureArraySetter( type ) {

\tswitch ( type ) {

${arraySetterCases}

\t}

\tthrow new Error( 'THREE.WebGLUniforms: Unsupported array uniform type.' );

}

${nativeUniformBindingsEnabled ? nativeUniformBindingHelpers : ''}

// --- Uniform Classes ---

class SingleUniform {

\t/** @param {string} id @param {NativeActiveUniformInfo} activeInfo @param {${glHandle}} addr */
\tconstructor( id, activeInfo, addr ) {

\t\tthis.id = id;
${nativeUniformBindingsEnabled ? '\t\tthis.nativeBindingSlot = nativeUniformBindingSlot( id );' : ''}
\t\tthis.addr = addr;
\t\t// A native number[] read past its length is not \`undefined\`, so the
\t\t// cache starts with four slots no value compares equal to.
\t\t/** @type {number[]} */
\t\tthis.cache = [ NaN, NaN, NaN, NaN ];
\t\tthis.type = activeInfo.type;
\t\tthis.setValue = getSingularSetter( activeInfo.type );

\t\t// this.path = activeInfo.name; // DEBUG

\t}

}

class PureArrayUniform {

\t/** @param {string} id @param {NativeActiveUniformInfo} activeInfo @param {${glHandle}} addr */
\tconstructor( id, activeInfo, addr ) {

\t\tthis.id = id;
${nativeUniformBindingsEnabled ? '\t\tthis.nativeBindingSlot = nativeUniformBindingSlot( id );' : ''}
\t\tthis.addr = addr;
\t\t// A native number[] read past its length is not \`undefined\`, so the
\t\t// cache starts with four slots no value compares equal to.
\t\t/** @type {number[]} */
\t\tthis.cache = [ NaN, NaN, NaN, NaN ];
\t\tthis.type = activeInfo.type;
\t\tthis.size = activeInfo.size;
\t\tthis.setValue = getPureArraySetter( activeInfo.type );

\t\t// this.path = activeInfo.name; // DEBUG

\t}

}

/**
 * The member a structured uniform's step reads: three writes \`value[ u.id ]\`,
 * where the value is an array (id is the index) or a light-uniform record
 * (id is the field name). The light records are classes, so the read is a
 * narrowed field read; an array indexes whichever arm it is.
 * @param {NativeUniformValue} value @param {string} id @return {NativeUniformValue}
 */
function structuredUniformMember( value, id ) {

\tif ( Array.isArray( value ) ) return value[ Number( id ) ];

\tif ( value instanceof NativeDirectionalLightUniform ) {

\t\tif ( id === 'direction' ) return value.direction;
\t\tif ( id === 'color' ) return value.color;

\t} else if ( value instanceof NativeSpotLightUniform ) {

\t\tif ( id === 'position' ) return value.position;
\t\tif ( id === 'direction' ) return value.direction;
\t\tif ( id === 'color' ) return value.color;
\t\tif ( id === 'distance' ) return value.distance;
\t\tif ( id === 'coneCos' ) return value.coneCos;
\t\tif ( id === 'penumbraCos' ) return value.penumbraCos;
\t\tif ( id === 'decay' ) return value.decay;

\t} else if ( value instanceof NativePointLightUniform ) {

\t\tif ( id === 'position' ) return value.position;
\t\tif ( id === 'color' ) return value.color;
\t\tif ( id === 'distance' ) return value.distance;
\t\tif ( id === 'decay' ) return value.decay;

\t} else if ( value instanceof NativeHemisphereLightUniform ) {

\t\tif ( id === 'direction' ) return value.direction;
\t\tif ( id === 'skyColor' ) return value.skyColor;
\t\tif ( id === 'groundColor' ) return value.groundColor;

\t} else if ( value instanceof NativeRectAreaLightUniform ) {

\t\tif ( id === 'color' ) return value.color;
\t\tif ( id === 'position' ) return value.position;
\t\tif ( id === 'halfWidth' ) return value.halfWidth;
\t\tif ( id === 'halfHeight' ) return value.halfHeight;

\t} else if ( value instanceof NativeShadowUniform ) {

\t\tif ( id === 'shadowIntensity' ) return value.shadowIntensity;
\t\tif ( id === 'shadowBias' ) return value.shadowBias;
\t\tif ( id === 'shadowNormalBias' ) return value.shadowNormalBias;
\t\tif ( id === 'shadowRadius' ) return value.shadowRadius;
\t\tif ( id === 'shadowMapSize' ) return value.shadowMapSize;

\t} else if ( value instanceof NativePointShadowUniform ) {

\t\tif ( id === 'shadowIntensity' ) return value.shadowIntensity;
\t\tif ( id === 'shadowBias' ) return value.shadowBias;
\t\tif ( id === 'shadowNormalBias' ) return value.shadowNormalBias;
\t\tif ( id === 'shadowRadius' ) return value.shadowRadius;
\t\tif ( id === 'shadowMapSize' ) return value.shadowMapSize;
\t\tif ( id === 'shadowCameraNear' ) return value.shadowCameraNear;
\t\tif ( id === 'shadowCameraFar' ) return value.shadowCameraFar;

\t}

\tthrow new Error( 'THREE.WebGLUniforms: structured uniform has no member ' + id + '.' );

}

class StructuredUniform {

\t/** @param {string} id */
\tconstructor( id ) {

\t\tthis.id = id;
${nativeUniformBindingsEnabled ? '\t\tthis.nativeBindingSlot = nativeUniformBindingSlot( id );' : ''}

\t\t/** @type {NativeUniform[]} */
\t\tthis.seq = [];
\t\t/** @type {Record<string, NativeUniform>} */
\t\tthis.map = {};

\t}

\t/** @param {${glContext}} gl @param {NativeUniformValue} value @param {NativeTextures|undefined} textures @return {void} */
\tsetValue( gl, value, textures ) {

\t\tconst seq = this.seq;

\t\tfor ( let i = 0, n = seq.length; i !== n; ++ i ) {

\t\t\tconst u = seq[ i ];
\t\t\tsetNativeUniformValue( u, gl, structuredUniformMember( value, u.id ), textures );

\t\t}

\t}

}

/**
 * Three kinds of uniform node, one dispatch: \`u.setValue\` is a field on the
 * two leaf classes and a method on the structured one, so the call is placed
 * behind an \`instanceof\` split rather than through the union.
 * @param {NativeUniform} uniform @param {${glContext}} gl @param {NativeUniformValue} value @param {NativeTextures|undefined} textures
 */
function setNativeUniformValue( uniform, gl, value, textures ) {

\tif ( uniform instanceof SingleUniform ) uniform.setValue( gl, value, textures );
\telse if ( uniform instanceof PureArrayUniform ) uniform.setValue( gl, value, textures );
\telse uniform.setValue( gl, value, textures );

}

// --- Top-level ---

// Parser - builds up the property tree from the path strings

const RePathPart = /(\\w+)(\\])?(\\[|\\.)?/g;

// extracts
// 	- the identifier (member name or array index)
//  - followed by an optional right bracket (found when array index)
//  - followed by an optional left bracket or dot (type of subscript)
//
// Note: These portions can be read in a non-overlapping fashion and
// allow straightforward parsing of the hierarchy that WebGL encodes
// in the uniform names.

/** @param {StructuredUniform|WebGLUniforms} container @param {NativeUniform} uniformObject */
function addUniform( container, uniformObject ) {

\tcontainer.seq.push( uniformObject );
\tcontainer.map[ uniformObject.id ] = uniformObject;

}

/** @param {NativeActiveUniformInfo} activeInfo @param {${glHandle}} addr @param {StructuredUniform|WebGLUniforms} container */
function parseUniform( activeInfo, addr, container ) {

\tconst path = activeInfo.name,
\t\tpathLength = path.length;

\t// reset RegExp object, because of the early exit of a previous run
\tRePathPart.lastIndex = 0;

\twhile ( true ) {

\t\tconst match = RePathPart.exec( path ),
\t\t\tmatchEnd = RePathPart.lastIndex;

\t\tconst id = match[ 1 ];
\t\tconst subscript = match[ 3 ];

\t\t// Native uniform maps use string keys; an array index stays the string
\t\t// it was parsed from and is converted where it indexes an array.
\t\tif ( subscript === '' || subscript === '[' && matchEnd + 2 === pathLength ) {

\t\t\t// bare name or "pure" bottom-level array "[0]" suffix

\t\t\taddUniform( container, subscript === '' ?
\t\t\t\tnew SingleUniform( id, activeInfo, addr ) :
\t\t\t\tnew PureArrayUniform( id, activeInfo, addr ) );

\t\t\tbreak;

\t\t} else {

\t\t\t// step into inner node / create it in case it doesn't exist

\t\t\tconst map = container.map;
\t\t\tlet next = map[ id ];

\t\t\tif ( next === undefined ) {

\t\t\t\tnext = new StructuredUniform( id );
\t\t\t\taddUniform( container, next );

\t\t\t}

\t\t\tcontainer = next;

\t\t}

\t}

}

/** @param {SingleUniform} uniform @param {${glContext}} gl @param {Matrix3} value */
function setNativeMatrix3UniformValue( uniform, gl, value ) {

\tconst cache = uniform.cache;
\tconst elements = value.elements;

\tif ( arraysEqual( cache, elements ) ) return;

\tgl.uniformMatrix3fv( uniform.addr, false, elements );
\tcopyArray( cache, elements );

}

/** @param {SingleUniform} uniform @param {${glContext}} gl @param {Matrix4} value */
function setNativeMatrix4UniformValue( uniform, gl, value ) {

\tconst cache = uniform.cache;
\tconst elements = value.elements;

\tif ( arraysEqual( cache, elements ) ) return;

\tgl.uniformMatrix4fv( uniform.addr, false, elements );
\tcopyArray( cache, elements );

}

// Root Container

class WebGLUniforms {

\t/** @param {${glContext}} gl @param {${glHandle}} program */
\tconstructor( gl, program ) {

\t\t/** @type {NativeUniform[]} */
\t\tthis.seq = [];
\t\t/** @type {Record<string, NativeUniform>} */
\t\tthis.map = {};

\t\tconst n = /** @type {number} */ ( gl.getProgramParameter( program, gl.ACTIVE_UNIFORMS ) );

\t\tfor ( let i = 0; i < n; ++ i ) {

\t\t\tconst info = /** @type {NativeActiveUniformInfo|null} */ ( gl.getActiveUniform( program, i ) );

\t\t\tif ( info === null ) continue;

\t\t\tconst addr = gl.getUniformLocation( program, info.name );

\t\t\tparseUniform( info, addr, this );

\t\t}

\t\t// Sort uniforms to prioritize shadow samplers first (for optimal texture unit allocation)

\t\t/** @type {NativeUniform[]} */
\t\tconst shadowSamplers = [];
\t\t/** @type {NativeUniform[]} */
\t\tconst otherUniforms = [];

\t\tfor ( const u of this.seq ) {

\t\t\tif ( u.type === gl.SAMPLER_2D_SHADOW || u.type === gl.SAMPLER_CUBE_SHADOW || u.type === gl.SAMPLER_2D_ARRAY_SHADOW ) {

\t\t\t\tshadowSamplers.push( u );

\t\t\t} else {

\t\t\t\totherUniforms.push( u );

\t\t\t}

\t\t}

\t\tif ( shadowSamplers.length > 0 ) {

\t\t\tfor ( const otherUniform of otherUniforms ) shadowSamplers.push( otherUniform );

\t\t\tthis.seq = shadowSamplers;

\t\t}

\t}

${fixedUniformMethods}
\t/** @param {${glContext}} gl @param {string} name @param {Matrix3} value */
\tsetMatrix3Value( gl, name, value ) {

\t\tconst uniform = this.map[ name ];

\t\tif ( uniform === undefined ) return;
\t\tif ( uniform instanceof SingleUniform ) {

\t\t\tsetNativeMatrix3UniformValue( uniform, gl, value );
\t\t\treturn;

\t\t}

\t\tthrow new Error( 'THREE.WebGLUniforms: Matrix3 fast path requires a single uniform.' );

\t}

\t/** @param {${glContext}} gl @param {string} name @param {Matrix4} value */
\tsetMatrix4Value( gl, name, value ) {

\t\tconst uniform = this.map[ name ];

\t\tif ( uniform === undefined ) return;
\t\tif ( uniform instanceof SingleUniform ) {

\t\t\tsetNativeMatrix4UniformValue( uniform, gl, value );
\t\t\treturn;

\t\t}

\t\tthrow new Error( 'THREE.WebGLUniforms: Matrix4 fast path requires a single uniform.' );

\t}

\t/** @param {${glContext}} gl @param {string} name @param {NativeUniformValue} value @param {NativeTextures|undefined} textures @return {void} */
\tsetValue( gl, name, value, textures ) {

\t\tconst u = this.map[ name ];

\t\tif ( u !== undefined ) setNativeUniformValue( u, gl, value, textures );

\t}

\t// three's \`setOptional( gl, object, name )\` -- a dynamic \`object[ name ]\`
\t// read -- has no caller in this build: the renderer's four uses are
\t// direct, typed uploads (\`setMatrix4Value\` for the bind matrices; the
\t// batching textures upload their own value on the line below each).

\t/** @param {${glContext}} gl @param {NativeUniform[]} seq @param {NativeUniforms} values @param {NativeTextures|undefined} textures @param {NativeClippingUniform|undefined} clippingPlanes */
\tstatic upload( gl, seq, values, textures, clippingPlanes ) {

\t\tfor ( let i = 0, n = seq.length; i !== n; ++ i ) {

\t\t\tconst u = seq[ i ];

\t\t\tif ( ${nativeUniformBindingsEnabled ? 'u.nativeBindingSlot === -1' : "u.id === 'clippingPlanes'"} && clippingPlanes !== undefined ) {

\t\t\t\tif ( clippingPlanes.needsUpdate !== false ) setNativeUniformValue( u, gl, clippingPlanes.value, textures );
\t\t\t\tcontinue;

\t\t\t}

\t\t\tconst v = ${nativeUniformBindingsEnabled ? 'nativeUniformBindingValue( values, u )' : 'values[ u.id ]'};

\t\t\tif ( v.needsUpdate !== false ) {

\t\t\t\t// note: always updating when .needsUpdate is undefined
\t\t\t\tsetNativeUniformValue( u, gl, v.value, textures );

\t\t\t}

\t\t}

\t}

\t/** @param {NativeUniform[]} seq @param {NativeUniforms} values @param {NativeClippingUniform|undefined} clippingPlanes @return {NativeUniform[]} */
\tstatic seqWithValue( seq, values, clippingPlanes ) {

\t\t/** @type {NativeUniform[]} */
\t\tconst r = [];

\t\tfor ( let i = 0, n = seq.length; i !== n; ++ i ) {

\t\t\tconst u = seq[ i ];

\t\t\tif ( u.id === 'clippingPlanes' ) {

\t\t\t\tif ( clippingPlanes !== undefined ) r.push( u );
\t\t\t\tcontinue;

\t\t\t}

\t\t\tif ( u.id in values ) r.push( u );

\t\t}

\t\treturn r;

\t}

}

export { WebGLUniforms };
`


export const nativeWebGLUniformsSource = nativeUniformNamesEnabled ? optimizedNativeWebGLUniformsSource
  : optimizedNativeWebGLUniformsSource.replace(fixedUniformMethods, '')

/**
 * `UniformsLib.js`: the light classes and the typedefs go in above the table,
 * the table is stated as sixteen `NativeUniforms` groups, and the empty light
 * arrays keep their arm casts (an empty `[]` has no arm of its own).
 * @param {string} transformed
 * @param {string} fileName
 * @param {(text: string, from: string, to: string, fileName: string, label: string) => string} replaceOne
 */
export const transformUniformsLib = (transformed, fileName, replaceOne) => {
  // The light-uniform slots carry a `properties: { direction: {}, ... }`
  // member three's renderer never reads -- it documents the struct layout the
  // GLSL declares. A slot is `{ value, needsUpdate? }` and nothing else.
  const propertiesBlock = /,\s*properties: \{(?:[^{}]|\{[^{}]*\})*\}/g
  const propertiesBlocks = transformed.match(propertiesBlock)
  if (propertiesBlocks === null || propertiesBlocks.length !== 8) {
    const count = propertiesBlocks === null ? 0 : propertiesBlocks.length
    throw new Error(`Three UniformsLib source at ${fileName} has ${count} light-uniform properties blocks; expected 8`)
  }
  transformed = transformed.replace(propertiesBlock, '')
  const groups = [...transformed.matchAll(/^\t(\w+): \{$/gm)].map((match) => match[1])
  if (groups.length !== 16) throw new Error(`Three UniformsLib source at ${fileName} declares ${groups.length} uniform groups; expected 16`)
  const texture = "import('../../textures/Texture.js').Texture"
  transformed = replaceOne(
    transformed,
    'const UniformsLib = {',
    `${nativeLightUniformClasses}
${nativeUniformTypedefs}
/**
 * The LTC tables are attached by RectAreaLightUniformsLib, an addon this
 * build does not ship; WebGLLights still copies them into its state, whose
 * slots start as \`null\`, so the unattached table is spelled the same way --
 * a declared null slot, never an absent field, which would put an
 * \`undefined\` into a nullable carrier.
 * @typedef {{
${groups.map((group) => ` *   ${group}: NativeUniforms,`).join('\n')}
 *   LTC_FLOAT_1: ${texture}|null,
 *   LTC_FLOAT_2: ${texture}|null,
 *   LTC_HALF_1: ${texture}|null,
 *   LTC_HALF_2: ${texture}|null
 * }} NativeUniformLibrary
 */
/** @type {NativeUniformLibrary} */
const UniformsLib = {

\tLTC_FLOAT_1: null,
\tLTC_FLOAT_2: null,
\tLTC_HALF_1: null,
\tLTC_HALF_2: null,
`,
    fileName,
    'UniformsLib native uniform model',
  )
  for (const [field, type] of [
    ['ambientLightColor', 'number[]'],
    ['lightProbe', "Array<import('../../math/Vector3.js').Vector3>"],
    ['directionalLights', 'NativeDirectionalLightUniform[]'],
    ['directionalLightShadows', 'NativeShadowUniform[]'],
    ['directionalShadowMatrix', "Array<import('../../math/Matrix4.js').Matrix4>"],
    ['spotLights', 'NativeSpotLightUniform[]'],
    ['spotLightShadows', 'NativeShadowUniform[]'],
    ['spotLightMap', `Array<${texture}|null>`],
    ['spotLightMatrix', "Array<import('../../math/Matrix4.js').Matrix4>"],
    ['pointLights', 'NativePointLightUniform[]'],
    ['pointLightShadows', 'NativePointShadowUniform[]'],
    ['pointShadowMatrix', "Array<import('../../math/Matrix4.js').Matrix4>"],
    ['hemisphereLights', 'NativeHemisphereLightUniform[]'],
    ['rectAreaLights', 'NativeRectAreaLightUniform[]'],
  ]) {
    transformed = replaceOne(transformed, `${field}: { value: []`, `${field}: { value: /** @type {${type}} */ ( [] )`, fileName, `UniformsLib ${field} holder`)
  }
  return transformed
}

const exportedNames = (source) => [...source.matchAll(/^export (?:function|const|class) (\w+)|^export \{ (\w+) \}/gm)].map((match) => match[1] ?? match[2])

/**
 * `UniformsUtils.js` is replaced whole. Its export surface must not shrink:
 * three's other modules import from it by name.
 * @param {string} transformed
 * @param {string} fileName
 */
export const transformUniformsUtils = (transformed, fileName) => {
  const provided = exportedNames(nativeUniformsUtilsSource)
  const missing = exportedNames(transformed).filter((name) => !provided.includes(name))
  if (missing.length > 0) throw new Error(`Three UniformsUtils replacement at ${fileName} drops exports: ${missing.join(', ')}`)
  return nativeUniformsUtilsSource
}
