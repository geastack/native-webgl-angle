/// <reference path="./gea-native-types.d.ts" />

import {
  logNativeWebGL,
  nativeWebGLActiveTexture,
  nativeWebGLAttachShader,
  nativeWebGLBindBuffer,
  nativeWebGLBindFramebuffer,
  nativeWebGLBindRenderbuffer,
  nativeWebGLBindTexture,
  nativeWebGLBindVertexArray,
  nativeWebGLBlendEquation,
  nativeWebGLBlendEquationSeparate,
  nativeWebGLBlendFunc,
  nativeWebGLBlendFuncSeparate,
  nativeWebGLCheckFramebufferStatus,
  nativeWebGLClear,
  nativeWebGLClearColor,
  nativeWebGLClearDepth,
  nativeWebGLClearStencil,
  nativeWebGLColorMask,
  nativeWebGLCompileShader,
  nativeWebGLCreateBuffer,
  nativeWebGLCreateFramebuffer,
  nativeWebGLCreateProgram,
  nativeWebGLCreateRenderbuffer,
  nativeWebGLCreateShader,
  nativeWebGLCreateTexture,
  nativeWebGLCreateVertexArray,
  nativeWebGLCullFace,
  nativeWebGLDeleteBuffer,
  nativeWebGLDeleteFramebuffer,
  nativeWebGLDeleteProgram,
  nativeWebGLDeleteRenderbuffer,
  nativeWebGLDeleteShader,
  nativeWebGLDeleteTexture,
  nativeWebGLDeleteVertexArray,
  nativeWebGLDepthFunc,
  nativeWebGLDepthMask,
  nativeWebGLDisable,
  nativeWebGLDisableVertexAttribArray,
  nativeWebGLDrawArrays,
  nativeWebGLDrawArraysInstanced,
  nativeWebGLDrawElementsInstanced,
  nativeWebGLVertexAttribDivisor,
  nativeWebGLDrawBuffers,
  nativeWebGLDrawElements,
  nativeWebGLEnable,
  nativeWebGLEnableVertexAttribArray,
  nativeWebGLFramebufferRenderbuffer,
  nativeWebGLFramebufferTexture2D,
  nativeWebGLFrontFace,
  nativeWebGLGenerateMipmap,
  nativeWebGLGetAttribLocation,
  nativeWebGLGetError,
  nativeWebGLGetActiveAttribInfo,
  nativeWebGLGetActiveUniformInfo,
  nativeWebGLGetProgramParameter,
  nativeWebGLGetShaderParameter,
  nativeWebGLGetUniformLocation,
  nativeWebGLHeight,
  nativeWebGLLineWidth,
  nativeWebGLLinkProgram,
  nativeWebGLPixelStorei,
  nativeWebGLPolygonOffset,
  nativeWebGLRenderbufferStorage,
  nativeWebGLScissor,
  nativeWebGLShaderSource,
  nativeWebGLStencilFunc,
  nativeWebGLStencilFuncSeparate,
  nativeWebGLStencilMask,
  nativeWebGLStencilMaskSeparate,
  nativeWebGLStencilOp,
  nativeWebGLStencilOpSeparate,
  nativeWebGLSwap,
  nativeWebGLTexParameteri,
  nativeWebGLUniform1f,
  nativeWebGLUniform1i,
  nativeWebGLUniform2f,
  nativeWebGLUniform3f,
  nativeWebGLUniform4f,
  nativeWebGLUseProgram,
  nativeWebGLVertexAttribPointer,
  nativeWebGLViewport,
  nativeWebGLWidth,
} from './nativeWebGLHost'

type NativeHandleKind =
  | 'buffer'
  | 'framebuffer'
  | 'program'
  | 'renderbuffer'
  | 'shader'
  | 'texture'
  | 'uniform'
  | 'vertexArray'

/**
 * @gea-refcount
 * Deliberately NOT marked no-runtime-bridge: a NativeHandle stored on a
 * gcv-boxed object (e.g. `uniform.addr`) is read back as a gea_cpp_value at the
 * WebGL intrinsic boundary, where the location is recovered via
 * record_get_literal on the nativeHandle field. Without the runtime bridge that
 * read returned missing so every uniform location resolved to 0 (all matrices
 * clobbered uniform 0 -> black cube). The bridge exposes the public
 * __nativeHandle field so the location survives the box round-trip.
 */
export class NativeHandle {
  readonly __nativeKind: NativeHandleKind
  readonly __nativeHandle: number

  constructor(kind: NativeHandleKind, handle: number) {
    this.__nativeKind = kind
    this.__nativeHandle = handle
  }

  // A field-only refcount class qualifies for runtime-value-bridge OMISSION
  // (classCanOmitRuntimeValueBridge), so a boxed NativeHandle exposed nothing to
  // record_get and its location resolved to 0. A single instance method
  // disqualifies omission, forcing the bridge that exposes the public
  // __nativeHandle field — the WebGL intrinsic boundary reads the location back
  // via record_get_literal("__nativeHandle") off the boxed handle.
  nativeHandleValue(): number {
    return this.__nativeHandle
  }
}

/** @gea-no-runtime-bridge @gea-refcount */
export class NativeShader extends NativeHandle {
  readonly __nativeKind = 'shader'
  shaderType: number
  source = ''

  constructor(handle: number, shaderType: number) {
    super('shader', handle)
    this.shaderType = shaderType
  }
}

/** @gea-no-runtime-bridge @gea-refcount */
export class NativeProgram extends NativeHandle {
  readonly __nativeKind = 'program'
  shaders: NativeShader[] = []

  constructor(handle: number) {
    super('program', handle)
  }
}

/** @gea-no-runtime-bridge */
class NativeWebGLCanvasMetrics {
  width: number
  height: number
  clientWidth: number
  clientHeight: number
  style = { width: '', height: '' }

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.clientWidth = width
    this.clientHeight = height
  }
}

type BufferSourceLike =
  | Float32Array
  | Float64Array
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | number[]
  | null
  | undefined

function createHandle(kind: NativeHandleKind, handle: number): NativeHandle { return new NativeHandle(kind, handle) }

function nativeHandle(value: NativeHandle): number { return value.__nativeHandle }

function nullableNativeHandle(value: NativeHandle | null | undefined): number { return value ? value.__nativeHandle : 0 }

function typedArrayKind(value: BufferSourceLike): number {
  // Test the original union directly. Null, undefined, and ordinary arrays
  // fail every typed-array identity check and take the default scalar kind.
  // A preliminary guard would narrow the binding to a new carrier that the
  // native compiler cannot reread from this parameter's original storage.
  if (value instanceof Uint16Array) return 2
  if (value instanceof Uint32Array) return 3
  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) return 4
  if (value instanceof Int8Array) return 5
  if (value instanceof Int16Array) return 6
  if (value instanceof Int32Array) return 7
  if (value instanceof Float64Array) return 8
  return 1
}

function zeroF32Array(length: number): f32[] {
  const out: f32[] = []
  for (let index = 0; index < length; index++) out.push(0 as f32)
  return out
}

/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform1fv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform2fv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform3fv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform4fv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform1iv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform2iv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform3iv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform4iv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform1uiv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform2uiv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform3uiv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniform4uiv(location: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniformMatrix2fv(location: number, count: number, transpose: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLBufferData(target: number, usage: number, typeCode: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLBufferSubDataRange(target: number, offset: number, typeCode: number, values: BufferSourceLike, sourceOffset: number, length: number): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLBufferSubData(target: number, offset: number, typeCode: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniformMatrix3fv(location: number, count: number, transpose: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLUniformMatrix4fv(location: number, count: number, transpose: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLTexImage2D(target: number, level: number, internalFormat: number, width: number, height: number, format: number, type: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLTexSubImage2D(target: number, level: number, xoffset: number, yoffset: number, width: number, height: number, format: number, type: number, values: BufferSourceLike): void
/** @gea-host-inert Reads its arguments, writes GL state only; never calls back into script. */
declare function threeWebGLTexStorage2D(target: number, levels: number, internalFormat: number, width: number, height: number): void

// Shader source keyed by the stable native GL handle. A NativeShader instance
// can be value-copied when it round-trips through a function-return / gcv
// boundary (the copy is reconstructed from its handle, resetting the mutable
// `source` field to its `''` default), so relying on `shader.source` surviving
// to link time is unsafe. The native handle is a ctor-set readonly field that
// DOES survive the copy, so we cache the source under it.
const shaderSourceByHandle = new Map<number, string>()

function shaderSourceFor(shader: NativeShader): string {
  return shaderSourceByHandle.get(nativeHandle(shader)) ?? shader.source ?? ''
}

// Program reflection (active attributes/uniforms) comes from REAL driver
// reflection: ANGLE's glGetActiveUniform / glGetActiveAttrib, serialized by the
// native host as `name|type|size` ("" past the end). Do NOT reconstruct this by
// text-parsing GLSL source — three.js depends on glGetActiveUniform semantics
// (struct arrays expanded per member as "directionalLights[0].direction", basic
// arrays reported as "name[0]" with size=N) to build its uniform-upload tree. A
// source parser misses #define-sized arrays and struct expansion, so every
// struct uniform (all lights, all shadows) silently never uploads.
//
// NOTE: the return type is a plain record. Annotating it as a class makes
// geatsc coerce the returned value back into a value-type at the boundary,
// which drops its fields (name → undefined at the three.js call site). A
// record return type is emitted as a gcv record and its fields survive.
function parseActiveInfoString(serialized: string): { name: string; type: number; size: number } | null {
  if (!serialized) return null
  const [name, type, size] = serialized.split('|')
  // A length test does not narrow an indexed read; the names themselves do.
  if (name === undefined || type === undefined || size === undefined) return null
  return { name, type: Number(type), size: Number(size) }
}

/** @gea-refcount */
/**
 * The attribute bag `getContext`'s second argument carries.
 *
 * Stated as a real record rather than left off, because three.js passes it --
 * `canvas.getContext( contextName, contextAttributes )` in
 * `WebGLRenderer.js`'s own `getContext` -- and a parameter this shim does not
 * declare is one the call cannot be checked against. Every field is the one
 * three fills in; none of them changes what an ANGLE context does, which is
 * why the body ignores the bag entirely and `getContextAttributes` answers
 * this host's own real values instead.
 */
export interface NativeWebGLContextAttributes {
  alpha: boolean
  depth: boolean
  stencil: boolean
  antialias: boolean
  premultipliedAlpha: boolean
  preserveDrawingBuffer: boolean
  powerPreference: string
  failIfMajorPerformanceCaveat: boolean
}

export class NativeWebGLCanvas {
  width: number
  height: number
  clientWidth: number
  clientHeight: number
  style = { width: '', height: '' }
  private context: NativeWebGL2RenderingContext | null = null

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.clientWidth = width
    this.clientHeight = height
  }

  getContext(name: string, _attributes?: NativeWebGLContextAttributes): NativeWebGL2RenderingContext | null {
    if (name === 'webgl2' || name === 'webgl') return this.context
    return null
  }

  setContext(context: NativeWebGL2RenderingContext): void {
    this.context = context
  }

  addEventListener(_type: string, _listener: (event: unknown) => void, ..._options: unknown[]): void {}
  removeEventListener(_type: string, _listener: (event: unknown) => void, ..._options: unknown[]): void {}
  setAttribute(_name: string, _value: string): void {}
  hasAttribute(_name: string): boolean { return false }
}

/**
 * The object `getExtension` hands back.
 *
 * Declared as ONE class rather than an interface per extension, and returned
 * as `WebGLExtension | null` rather than `object | null`, because `object`
 * states nothing: a consumer reading `extension.COMPRESSED_RGB_S3TC_DXT1_EXT`
 * off it has to box the whole value first. That single word cost geatsc **190
 * boxed carriers on `WebGLUtils.js`'s `let extension`** -- the largest single
 * declaration in the reference build -- plus 60 more on `ext_texture_norm16`
 * and fifteen further `extensions.get(...)` sites, because the compiler was
 * being told, accurately, that nothing is known about the members.
 *
 * One class, not an overload set keyed by extension name: overloads that
 * return different object types share no calling convention, and geatsc
 * refuses such a set outright (`no primitive joining N construct signatures
 * into one calling convention`). Naming every constant on one type is the
 * shape that both compiles and states the truth -- a consumer only ever reads
 * the constants belonging to the extension it asked for, and only after
 * testing the result for `null`.
 *
 * The values are the WebGL registry's own, so an instance handed out for one
 * extension carrying another's constants is inert: three reads
 * `COMPRESSED_*` only inside the branch that matched the extension it
 * requested. The method stubs exist for the same reason the constants do --
 * three's call sites are compiled whether or not this shim reports the
 * extension as supported, and a call needs a declaration to compile against.
 * `getSupportedExtensions` remains the authority on what is actually
 * available, and every unsupported name still answers `null`.
 */
export class WebGLExtension {
  readonly COMPRESSED_RGB_S3TC_DXT1_EXT = 0x83f0
  readonly COMPRESSED_RGBA_S3TC_DXT1_EXT = 0x83f1
  readonly COMPRESSED_RGBA_S3TC_DXT3_EXT = 0x83f2
  readonly COMPRESSED_RGBA_S3TC_DXT5_EXT = 0x83f3
  readonly COMPRESSED_SRGB_S3TC_DXT1_EXT = 0x8c4c
  readonly COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT = 0x8c4d
  readonly COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT = 0x8c4e
  readonly COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT = 0x8c4f

  readonly COMPRESSED_RGB_PVRTC_4BPPV1_IMG = 0x8c00
  readonly COMPRESSED_RGB_PVRTC_2BPPV1_IMG = 0x8c01
  readonly COMPRESSED_RGBA_PVRTC_4BPPV1_IMG = 0x8c02
  readonly COMPRESSED_RGBA_PVRTC_2BPPV1_IMG = 0x8c03

  readonly COMPRESSED_R11_EAC = 0x9270
  readonly COMPRESSED_SIGNED_R11_EAC = 0x9271
  readonly COMPRESSED_RG11_EAC = 0x9272
  readonly COMPRESSED_SIGNED_RG11_EAC = 0x9273
  readonly COMPRESSED_RGB8_ETC2 = 0x9274
  readonly COMPRESSED_SRGB8_ETC2 = 0x9275
  readonly COMPRESSED_RGBA8_ETC2_EAC = 0x9278
  readonly COMPRESSED_SRGB8_ALPHA8_ETC2_EAC = 0x9279

  readonly COMPRESSED_RGBA_ASTC_4x4_KHR = 0x93b0
  readonly COMPRESSED_RGBA_ASTC_5x4_KHR = 0x93b1
  readonly COMPRESSED_RGBA_ASTC_5x5_KHR = 0x93b2
  readonly COMPRESSED_RGBA_ASTC_6x5_KHR = 0x93b3
  readonly COMPRESSED_RGBA_ASTC_6x6_KHR = 0x93b4
  readonly COMPRESSED_RGBA_ASTC_8x5_KHR = 0x93b5
  readonly COMPRESSED_RGBA_ASTC_8x6_KHR = 0x93b6
  readonly COMPRESSED_RGBA_ASTC_8x8_KHR = 0x93b7
  readonly COMPRESSED_RGBA_ASTC_10x5_KHR = 0x93b8
  readonly COMPRESSED_RGBA_ASTC_10x6_KHR = 0x93b9
  readonly COMPRESSED_RGBA_ASTC_10x8_KHR = 0x93ba
  readonly COMPRESSED_RGBA_ASTC_10x10_KHR = 0x93bb
  readonly COMPRESSED_RGBA_ASTC_12x10_KHR = 0x93bc
  readonly COMPRESSED_RGBA_ASTC_12x12_KHR = 0x93bd
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR = 0x93d0
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR = 0x93d1
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR = 0x93d2
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR = 0x93d3
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR = 0x93d4
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR = 0x93d5
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR = 0x93d6
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR = 0x93d7
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR = 0x93d8
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR = 0x93d9
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR = 0x93da
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR = 0x93db
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR = 0x93dc
  readonly COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR = 0x93dd

  readonly COMPRESSED_RGBA_BPTC_UNORM_EXT = 0x8e8c
  readonly COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT = 0x8e8d
  readonly COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT = 0x8e8e
  readonly COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT = 0x8e8f

  readonly COMPRESSED_RED_RGTC1_EXT = 0x8dbb
  readonly COMPRESSED_SIGNED_RED_RGTC1_EXT = 0x8dbc
  readonly COMPRESSED_RED_GREEN_RGTC2_EXT = 0x8dbd
  readonly COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT = 0x8dbe

  readonly MAX_TEXTURE_MAX_ANISOTROPY_EXT = 0x84ff
  readonly TEXTURE_MAX_ANISOTROPY_EXT = 0x84fe
  readonly UNMASKED_VENDOR_WEBGL = 0x9245
  readonly UNMASKED_RENDERER_WEBGL = 0x9246
  readonly MAX_SAMPLES_EXT = 0x8d57

  loseContext(): void {}
  restoreContext(): void {}

  multiDrawArraysWEBGL(mode: number, firsts: Int32Array, firstsOffset: number, counts: Int32Array, countsOffset: number, drawCount: number): void {
    void mode
    void firsts
    void firstsOffset
    void counts
    void countsOffset
    void drawCount
  }

  multiDrawElementsWEBGL(
    mode: number,
    counts: Int32Array,
    countsOffset: number,
    type: number,
    offsets: Int32Array,
    offsetsOffset: number,
    drawCount: number
  ): void {
    void mode
    void counts
    void countsOffset
    void type
    void offsets
    void offsetsOffset
    void drawCount
  }

  renderbufferStorageMultisampleEXT(target: number, samples: number, internalformat: number, width: number, height: number): void {
    void target
    void samples
    void internalformat
    void width
    void height
  }

  framebufferTexture2DMultisampleEXT(
    target: number,
    attachment: number,
    textarget: number,
    texture: NativeHandle | null,
    level: number,
    samples: number
  ): void {
    void target
    void attachment
    void textarget
    void texture
    void level
    void samples
  }

  framebufferTextureMultisampleMultiviewOVR(
    target: number,
    attachment: number,
    texture: NativeHandle | null,
    level: number,
    samples: number,
    baseViewIndex: number,
    numViews: number
  ): void {
    void target
    void attachment
    void texture
    void level
    void samples
    void baseViewIndex
    void numViews
  }

  blendEquationSeparateiOES(buf: number, modeRGB: number, modeAlpha: number): void {
    void buf
    void modeRGB
    void modeAlpha
  }

  blendFuncSeparateiOES(buf: number, srcRGB: number, dstRGB: number, srcAlpha: number, dstAlpha: number): void {
    void buf
    void srcRGB
    void dstRGB
    void srcAlpha
    void dstAlpha
  }
}

export function createNativeWebGLCanvas(width: number, height: number): NativeWebGLCanvas {
  const canvas = new NativeWebGLCanvas(width, height)
  canvas.setContext(new NativeWebGL2RenderingContext(
    () => canvas.width,
    () => canvas.height,
  ))
  return canvas
}

export class NativeWebGL2RenderingContext {
  private readonly canvasWidth: () => number
  private readonly canvasHeight: () => number

  readonly DEPTH_BUFFER_BIT = 0x00000100
  readonly STENCIL_BUFFER_BIT = 0x00000400
  readonly COLOR_BUFFER_BIT = 0x00004000
  readonly POINTS = 0x0000
  readonly LINES = 0x0001
  readonly LINE_LOOP = 0x0002
  readonly LINE_STRIP = 0x0003
  readonly TRIANGLES = 0x0004
  readonly TRIANGLE_STRIP = 0x0005
  readonly TRIANGLE_FAN = 0x0006
  readonly ZERO = 0
  readonly ONE = 1
  readonly SRC_COLOR = 0x0300
  readonly ONE_MINUS_SRC_COLOR = 0x0301
  readonly SRC_ALPHA = 0x0302
  readonly ONE_MINUS_SRC_ALPHA = 0x0303
  readonly DST_ALPHA = 0x0304
  readonly ONE_MINUS_DST_ALPHA = 0x0305
  readonly DST_COLOR = 0x0306
  readonly ONE_MINUS_DST_COLOR = 0x0307
  readonly SRC_ALPHA_SATURATE = 0x0308
  readonly FUNC_ADD = 0x8006
  readonly BLEND_EQUATION = 0x8009
  readonly BLEND_EQUATION_RGB = 0x8009
  readonly BLEND_EQUATION_ALPHA = 0x883D
  readonly FUNC_SUBTRACT = 0x800A
  readonly FUNC_REVERSE_SUBTRACT = 0x800B
  readonly BLEND_DST_RGB = 0x80C8
  readonly BLEND_SRC_RGB = 0x80C9
  readonly BLEND_DST_ALPHA = 0x80CA
  readonly BLEND_SRC_ALPHA = 0x80CB
  readonly CONSTANT_COLOR = 0x8001
  readonly ONE_MINUS_CONSTANT_COLOR = 0x8002
  readonly CONSTANT_ALPHA = 0x8003
  readonly ONE_MINUS_CONSTANT_ALPHA = 0x8004
  readonly BLEND_COLOR = 0x8005
  readonly ARRAY_BUFFER = 0x8892
  readonly ELEMENT_ARRAY_BUFFER = 0x8893
  readonly ARRAY_BUFFER_BINDING = 0x8894
  readonly ELEMENT_ARRAY_BUFFER_BINDING = 0x8895
  readonly STREAM_DRAW = 0x88E0
  readonly STATIC_DRAW = 0x88E4
  readonly DYNAMIC_DRAW = 0x88E8
  readonly BUFFER_SIZE = 0x8764
  readonly BUFFER_USAGE = 0x8765
  readonly CURRENT_VERTEX_ATTRIB = 0x8626
  readonly FRONT = 0x0404
  readonly BACK = 0x0405
  readonly FRONT_AND_BACK = 0x0408
  readonly CULL_FACE = 0x0B44
  readonly BLEND = 0x0BE2
  readonly DITHER = 0x0BD0
  readonly STENCIL_TEST = 0x0B90
  readonly DEPTH_TEST = 0x0B71
  readonly SCISSOR_TEST = 0x0C11
  readonly POLYGON_OFFSET_FILL = 0x8037
  readonly SAMPLE_ALPHA_TO_COVERAGE = 0x809E
  readonly SAMPLE_COVERAGE = 0x80A0
  readonly NO_ERROR = 0
  readonly INVALID_ENUM = 0x0500
  readonly INVALID_VALUE = 0x0501
  readonly INVALID_OPERATION = 0x0502
  readonly OUT_OF_MEMORY = 0x0505
  readonly CW = 0x0900
  readonly CCW = 0x0901
  readonly LINE_WIDTH = 0x0B21
  readonly ALIASED_POINT_SIZE_RANGE = 0x846D
  readonly ALIASED_LINE_WIDTH_RANGE = 0x846E
  readonly CULL_FACE_MODE = 0x0B45
  readonly FRONT_FACE = 0x0B46
  readonly DEPTH_RANGE = 0x0B70
  readonly DEPTH_WRITEMASK = 0x0B72
  readonly DEPTH_CLEAR_VALUE = 0x0B73
  readonly DEPTH_FUNC = 0x0B74
  readonly STENCIL_CLEAR_VALUE = 0x0B91
  readonly STENCIL_FUNC = 0x0B92
  readonly STENCIL_FAIL = 0x0B94
  readonly STENCIL_PASS_DEPTH_FAIL = 0x0B95
  readonly STENCIL_PASS_DEPTH_PASS = 0x0B96
  readonly STENCIL_REF = 0x0B97
  readonly STENCIL_VALUE_MASK = 0x0B93
  readonly STENCIL_WRITEMASK = 0x0B98
  readonly VIEWPORT = 0x0BA2
  readonly SCISSOR_BOX = 0x0C10
  readonly COLOR_CLEAR_VALUE = 0x0C22
  readonly COLOR_WRITEMASK = 0x0C23
  readonly UNPACK_ALIGNMENT = 0x0CF5
  readonly PACK_ALIGNMENT = 0x0D05
  readonly MAX_TEXTURE_SIZE = 0x0D33
  readonly MAX_VIEWPORT_DIMS = 0x0D3A
  readonly SUBPIXEL_BITS = 0x0D50
  readonly RED_BITS = 0x0D52
  readonly GREEN_BITS = 0x0D53
  readonly BLUE_BITS = 0x0D54
  readonly ALPHA_BITS = 0x0D55
  readonly DEPTH_BITS = 0x0D56
  readonly STENCIL_BITS = 0x0D57
  readonly POLYGON_OFFSET_UNITS = 0x2A00
  readonly POLYGON_OFFSET_FACTOR = 0x8038
  readonly TEXTURE_BINDING_2D = 0x8069
  readonly SAMPLE_BUFFERS = 0x80A8
  readonly SAMPLES = 0x80A9
  readonly SAMPLE_COVERAGE_VALUE = 0x80AA
  readonly SAMPLE_COVERAGE_INVERT = 0x80AB
  readonly COMPRESSED_TEXTURE_FORMATS = 0x86A3
  readonly DONT_CARE = 0x1100
  readonly FASTEST = 0x1101
  readonly NICEST = 0x1102
  readonly GENERATE_MIPMAP_HINT = 0x8192
  readonly BYTE = 0x1400
  readonly UNSIGNED_BYTE = 0x1401
  readonly SHORT = 0x1402
  readonly UNSIGNED_SHORT = 0x1403
  readonly INT = 0x1404
  readonly UNSIGNED_INT = 0x1405
  readonly FLOAT = 0x1406
  readonly SYNC_FLUSH_COMMANDS_BIT = 0x00000001
  readonly ALREADY_SIGNALED = 0x911A
  readonly TIMEOUT_EXPIRED = 0x911B
  readonly CONDITION_SATISFIED = 0x911C
  readonly WAIT_FAILED = 0x911D
  readonly COLOR = 0x1800
  readonly DEPTH_COMPONENT = 0x1902
  readonly ALPHA = 0x1906
  readonly RGB = 0x1907
  readonly RGBA = 0x1908
  readonly LUMINANCE = 0x1909
  readonly LUMINANCE_ALPHA = 0x190A
  readonly UNSIGNED_SHORT_4_4_4_4 = 0x8033
  readonly UNSIGNED_SHORT_5_5_5_1 = 0x8034
  readonly UNSIGNED_SHORT_5_6_5 = 0x8363
  readonly FRAGMENT_SHADER = 0x8B30
  readonly VERTEX_SHADER = 0x8B31
  readonly MAX_VERTEX_ATTRIBS = 0x8869
  readonly MAX_VERTEX_UNIFORM_VECTORS = 0x8DFB
  readonly MAX_VARYING_VECTORS = 0x8DFC
  readonly MAX_COMBINED_TEXTURE_IMAGE_UNITS = 0x8B4D
  readonly MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0x8B4C
  readonly MAX_TEXTURE_IMAGE_UNITS = 0x8872
  readonly MAX_FRAGMENT_UNIFORM_VECTORS = 0x8DFD
  readonly SHADER_TYPE = 0x8B4F
  readonly DELETE_STATUS = 0x8B80
  readonly COMPILE_STATUS = 0x8B81
  readonly LINK_STATUS = 0x8B82
  readonly VALIDATE_STATUS = 0x8B83
  readonly ATTACHED_SHADERS = 0x8B85
  readonly ACTIVE_UNIFORMS = 0x8B86
  readonly ACTIVE_ATTRIBUTES = 0x8B89
  readonly SHADING_LANGUAGE_VERSION = 0x8B8C
  readonly CURRENT_PROGRAM = 0x8B8D
  readonly NEVER = 0x0200
  readonly LESS = 0x0201
  readonly EQUAL = 0x0202
  readonly LEQUAL = 0x0203
  readonly GREATER = 0x0204
  readonly NOTEQUAL = 0x0205
  readonly GEQUAL = 0x0206
  readonly ALWAYS = 0x0207
  readonly KEEP = 0x1E00
  readonly REPLACE = 0x1E01
  readonly INCR = 0x1E02
  readonly DECR = 0x1E03
  readonly INVERT = 0x150A
  readonly INCR_WRAP = 0x8507
  readonly DECR_WRAP = 0x8508
  readonly VENDOR = 0x1F00
  readonly RENDERER = 0x1F01
  readonly VERSION = 0x1F02
  readonly NEAREST = 0x2600
  readonly LINEAR = 0x2601
  readonly NEAREST_MIPMAP_NEAREST = 0x2700
  readonly LINEAR_MIPMAP_NEAREST = 0x2701
  readonly NEAREST_MIPMAP_LINEAR = 0x2702
  readonly LINEAR_MIPMAP_LINEAR = 0x2703
  readonly TEXTURE_MAG_FILTER = 0x2800
  readonly TEXTURE_MIN_FILTER = 0x2801
  readonly TEXTURE_WRAP_S = 0x2802
  readonly TEXTURE_WRAP_T = 0x2803
  readonly TEXTURE_2D = 0x0DE1
  readonly TEXTURE = 0x1702
  readonly TEXTURE_CUBE_MAP = 0x8513
  readonly TEXTURE_BINDING_CUBE_MAP = 0x8514
  readonly TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515
  readonly TEXTURE_CUBE_MAP_NEGATIVE_X = 0x8516
  readonly TEXTURE_CUBE_MAP_POSITIVE_Y = 0x8517
  readonly TEXTURE_CUBE_MAP_NEGATIVE_Y = 0x8518
  readonly TEXTURE_CUBE_MAP_POSITIVE_Z = 0x8519
  readonly TEXTURE_CUBE_MAP_NEGATIVE_Z = 0x851A
  readonly MAX_CUBE_MAP_TEXTURE_SIZE = 0x851C
  readonly TEXTURE0 = 0x84C0
  readonly TEXTURE1 = 0x84C1
  readonly TEXTURE2 = 0x84C2
  readonly TEXTURE3 = 0x84C3
  readonly TEXTURE31 = 0x84DF
  readonly ACTIVE_TEXTURE = 0x84E0
  readonly MAX_RENDERBUFFER_SIZE = 0x84E8
  readonly REPEAT = 0x2901
  readonly CLAMP_TO_EDGE = 0x812F
  readonly MIRRORED_REPEAT = 0x8370
  readonly FLOAT_VEC2 = 0x8B50
  readonly FLOAT_VEC3 = 0x8B51
  readonly FLOAT_VEC4 = 0x8B52
  readonly INT_VEC2 = 0x8B53
  readonly INT_VEC3 = 0x8B54
  readonly INT_VEC4 = 0x8B55
  readonly BOOL = 0x8B56
  readonly BOOL_VEC2 = 0x8B57
  readonly BOOL_VEC3 = 0x8B58
  readonly BOOL_VEC4 = 0x8B59
  readonly FLOAT_MAT2 = 0x8B5A
  readonly FLOAT_MAT3 = 0x8B5B
  readonly FLOAT_MAT4 = 0x8B5C
  readonly SAMPLER_2D = 0x8B5E
  readonly SAMPLER_CUBE = 0x8B60
  readonly LOW_FLOAT = 0x8DF0
  readonly MEDIUM_FLOAT = 0x8DF1
  readonly HIGH_FLOAT = 0x8DF2
  readonly LOW_INT = 0x8DF3
  readonly MEDIUM_INT = 0x8DF4
  readonly HIGH_INT = 0x8DF5
  readonly FRAMEBUFFER = 0x8D40
  readonly RENDERBUFFER = 0x8D41
  readonly RGBA4 = 0x8056
  readonly RGB5_A1 = 0x8057
  readonly RGBA8 = 0x8058
  readonly RGB565 = 0x8D62
  readonly DEPTH_COMPONENT16 = 0x81A5
  readonly DEPTH_COMPONENT24 = 0x81A6
  readonly STENCIL_INDEX8 = 0x8D48
  readonly DEPTH_STENCIL = 0x84F9
  readonly RENDERBUFFER_WIDTH = 0x8D42
  readonly RENDERBUFFER_HEIGHT = 0x8D43
  readonly RENDERBUFFER_INTERNAL_FORMAT = 0x8D44
  readonly RENDERBUFFER_RED_SIZE = 0x8D50
  readonly RENDERBUFFER_GREEN_SIZE = 0x8D51
  readonly RENDERBUFFER_BLUE_SIZE = 0x8D52
  readonly RENDERBUFFER_ALPHA_SIZE = 0x8D53
  readonly RENDERBUFFER_DEPTH_SIZE = 0x8D54
  readonly RENDERBUFFER_STENCIL_SIZE = 0x8D55
  readonly FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE = 0x8CD0
  readonly FRAMEBUFFER_ATTACHMENT_OBJECT_NAME = 0x8CD1
  readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL = 0x8CD2
  readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE = 0x8CD3
  readonly COLOR_ATTACHMENT0 = 0x8CE0
  readonly DEPTH_ATTACHMENT = 0x8D00
  readonly STENCIL_ATTACHMENT = 0x8D20
  readonly DEPTH_STENCIL_ATTACHMENT = 0x821A
  readonly NONE = 0
  readonly FRAMEBUFFER_COMPLETE = 0x8CD5
  readonly FRAMEBUFFER_INCOMPLETE_ATTACHMENT = 0x8CD6
  readonly FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT = 0x8CD7
  readonly FRAMEBUFFER_INCOMPLETE_DIMENSIONS = 0x8CD9
  readonly FRAMEBUFFER_UNSUPPORTED = 0x8CDD
  readonly HALF_FLOAT = 0x140B
  readonly DEPTH24_STENCIL8 = 0x88F0
  readonly DEPTH_COMPONENT32F = 0x8CAC
  readonly DEPTH32F_STENCIL8 = 0x8CAD
  readonly RGBA32F = 0x8814
  readonly RGB32F = 0x8815
  readonly RGBA16F = 0x881A
  readonly RGB16F = 0x881B
  readonly READ_FRAMEBUFFER = 0x8CA8
  readonly DRAW_FRAMEBUFFER = 0x8CA9
  readonly READ_FRAMEBUFFER_BINDING = 0x8CAA
  readonly DRAW_FRAMEBUFFER_BINDING = 0x8CA6
  readonly UNPACK_FLIP_Y_WEBGL = 0x9240
  readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241
  readonly UNPACK_COLORSPACE_CONVERSION_WEBGL = 0x9243
  readonly READ_BUFFER = 0x0C02
  readonly UNPACK_ROW_LENGTH = 0x0CF2
  readonly UNPACK_SKIP_ROWS = 0x0CF3
  readonly UNPACK_SKIP_PIXELS = 0x0CF4
  readonly UNPACK_IMAGE_HEIGHT = 0x806E
  readonly UNPACK_SKIP_IMAGES = 0x806D
  readonly MAX_SAMPLES = 0x8D57
  readonly TEXTURE_3D = 0x806F
  readonly TEXTURE_2D_ARRAY = 0x8C1A
  readonly MAX_3D_TEXTURE_SIZE = 0x8073
  readonly MAX_ARRAY_TEXTURE_LAYERS = 0x88FF
  readonly RED = 0x1903
  readonly RG = 0x8227
  readonly RED_INTEGER = 0x8D94
  readonly RG_INTEGER = 0x8228
  readonly RGBA_INTEGER = 0x8D99
  readonly SRGB8_ALPHA8 = 0x8C43
  readonly IMPLEMENTATION_COLOR_READ_FORMAT = 0x8B9B
  readonly IMPLEMENTATION_COLOR_READ_TYPE = 0x8B9A
  readonly TEXTURE_WRAP_R = 0x8072
  readonly TEXTURE_COMPARE_MODE = 0x884C
  readonly TEXTURE_COMPARE_FUNC = 0x884D
  readonly COMPARE_REF_TO_TEXTURE = 0x884E
  readonly MAX_UNIFORM_BUFFER_BINDINGS = 0x8A2F
  readonly UNIFORM_BUFFER = 0x8A11
  readonly DRAW_BUFFER0 = 0x8825
  readonly BROWSER_DEFAULT_WEBGL = 0x9244
  readonly MIN = 0x8007
  readonly MAX = 0x8008
  readonly UNSIGNED_INT_10F_11F_11F_REV = 0x8C3B
  readonly UNSIGNED_INT_5_9_9_9_REV = 0x8C3E
  readonly UNSIGNED_INT_24_8 = 0x84FA
  readonly R11F_G11F_B10F = 0x8C3A
  readonly RGB9_E5 = 0x8C3D
  readonly R8 = 0x8229
  readonly R8I = 0x8231
  readonly R8UI = 0x8232
  readonly R16I = 0x8233
  readonly R16UI = 0x8234
  readonly R32I = 0x8235
  readonly R32UI = 0x8236
  readonly R16F = 0x822D
  readonly R32F = 0x822E
  readonly RG8 = 0x822B
  readonly RG8I = 0x8237
  readonly RG8UI = 0x8238
  readonly RG16I = 0x8239
  readonly RG16UI = 0x823A
  readonly RG32I = 0x823B
  readonly RG32UI = 0x823C
  readonly RG16F = 0x822F
  readonly RG32F = 0x8230
  readonly RGB8I = 0x8D8F
  readonly RGB8UI = 0x8D7D
  readonly RGB16I = 0x8D89
  readonly RGB16UI = 0x8D77
  readonly RGB32I = 0x8D83
  readonly RGB32UI = 0x8D71
  readonly RGBA8I = 0x8D8E
  readonly RGBA8UI = 0x8D7C
  readonly RGBA16I = 0x8D88
  readonly RGBA16UI = 0x8D76
  readonly RGBA32I = 0x8D82
  readonly RGBA32UI = 0x8D70
  readonly RGB_INTEGER = 0x8D98
  readonly SAMPLER_2D_SHADOW = 0x8B62
  readonly SAMPLER_CUBE_SHADOW = 0x8DC5
  readonly SAMPLER_2D_ARRAY_SHADOW = 0x8DCF
  readonly PACK_ROW_LENGTH = 0x0D02
  readonly PACK_SKIP_ROWS = 0x0D03
  readonly PACK_SKIP_PIXELS = 0x0D04

  constructor(canvasWidth: () => number, canvasHeight: () => number) {
    this.canvasWidth = canvasWidth
    this.canvasHeight = canvasHeight
  }

  get canvas(): NativeWebGLCanvasMetrics { return new NativeWebGLCanvasMetrics(this.canvasWidth(), this.canvasHeight()) }
  get drawingBufferWidth(): number { return nativeWebGLWidth() }
  get drawingBufferHeight(): number { return nativeWebGLHeight() }

  getContextAttributes() {
    return {
      alpha: true,
      antialias: false,
      depth: true,
      desynchronized: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'default',
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: true,
      xrCompatible: false,
    }
  }

  isContextLost(): boolean { return false }
  getSupportedExtensions(): string[] { return ['EXT_texture_filter_anisotropic', 'OES_texture_float_linear', 'EXT_color_buffer_float'] }

  getExtension(name: string): WebGLExtension | null {
    // One shared shape for every supported name -- see `WebGLExtension`. The
    // per-name literals this replaced carried only the two constants each
    // caller happened to read, and typed the result `object`, which is what
    // made every read of them dynamic.
    if (
      name === 'EXT_texture_filter_anisotropic' ||
      name === 'WEBGL_debug_renderer_info' ||
      name === 'OES_texture_float_linear' ||
      name === 'EXT_color_buffer_float' ||
      name === 'EXT_color_buffer_half_float'
    ) {
      return new WebGLExtension()
    }
    return null
  }

  getParameter(name: number): number | string | Int32Array | Float32Array {
    if (name === this.VERSION) return 'WebGL 2.0 (ANGLE Metal native shim)'
    if (name === this.SHADING_LANGUAGE_VERSION) return 'WebGL GLSL ES 3.00'
    if (name === this.VENDOR) return 'Gea'
    if (name === this.RENDERER) return 'Three.js -> WebGL shim -> ANGLE/Metal'
    if (name === this.MAX_TEXTURE_SIZE || name === this.MAX_CUBE_MAP_TEXTURE_SIZE) return 16384
    if (name === this.MAX_RENDERBUFFER_SIZE || name === this.MAX_3D_TEXTURE_SIZE) return 16384
    if (name === this.MAX_ARRAY_TEXTURE_LAYERS) return 2048
    if (name === this.MAX_VERTEX_ATTRIBS) return 16
    if (name === this.MAX_TEXTURE_IMAGE_UNITS || name === this.MAX_VERTEX_TEXTURE_IMAGE_UNITS) return 16
    if (name === this.MAX_COMBINED_TEXTURE_IMAGE_UNITS) return 32
    if (name === this.MAX_VERTEX_UNIFORM_VECTORS || name === this.MAX_FRAGMENT_UNIFORM_VECTORS) return 1024
    if (name === this.MAX_VARYING_VECTORS) return 32
    if (name === this.MAX_SAMPLES || name === this.SAMPLES) return 4
    if (name === this.MAX_UNIFORM_BUFFER_BINDINGS) return 24
    if (name === this.DEPTH_BITS) return 24
    if (name === this.STENCIL_BITS) return 8
    if (name === this.RED_BITS || name === this.GREEN_BITS || name === this.BLUE_BITS || name === this.ALPHA_BITS) return 8
    if (name === this.IMPLEMENTATION_COLOR_READ_FORMAT) return this.RGBA
    if (name === this.IMPLEMENTATION_COLOR_READ_TYPE) return this.UNSIGNED_BYTE
    if (name === this.MAX_VIEWPORT_DIMS) return new Int32Array([16384, 16384])
    if (name === this.VIEWPORT || name === this.SCISSOR_BOX) return new Int32Array([0, 0, this.canvasWidth(), this.canvasHeight()])
    if (name === this.ALIASED_LINE_WIDTH_RANGE || name === this.ALIASED_POINT_SIZE_RANGE) return new Float32Array([1, 1])
    if (name === this.COMPRESSED_TEXTURE_FORMATS) return new Int32Array(0)
    if (name === 0x84FF) return 1
    return 0
  }

  getShaderPrecisionFormat(_shadertype: number, _precisiontype: number): { rangeMin: number; rangeMax: number; precision: number } {
    return { rangeMin: 127, rangeMax: 127, precision: 23 }
  }

  createBuffer(): NativeHandle { return createHandle('buffer', nativeWebGLCreateBuffer()) }
  deleteBuffer(buffer: NativeHandle | null): void { nativeWebGLDeleteBuffer(nullableNativeHandle(buffer)) }
  bindBuffer(target: number, buffer: NativeHandle | null): void { nativeWebGLBindBuffer(target, nullableNativeHandle(buffer)) }
  bufferData(target: number, dataOrSize: BufferSourceLike | number, usage: number): void {
    if (typeof dataOrSize === 'number') {
      threeWebGLBufferData(target, usage, 4, zeroF32Array(dataOrSize))
      return
    }
    threeWebGLBufferData(target, usage, typedArrayKind(dataOrSize), dataOrSize)
  }
  bufferDataWithKind(target: number, data: BufferSourceLike, usage: number, kind: number): void {
    threeWebGLBufferData(target, usage, kind, data)
  }
  bufferSubData(target: number, offset: number, data: BufferSourceLike): void {
    threeWebGLBufferSubData(target, offset, typedArrayKind(data), data)
  }
  bufferSubDataWithKind(
    target: number,
    offset: number,
    data: BufferSourceLike,
    kind: number,
    sourceOffset = 0,
    length?: number,
  ): void {
    if (!data) return
    const end = length === undefined ? data.length : Math.min(data.length, sourceOffset + length)
    threeWebGLBufferSubDataRange(target, offset, kind, data, sourceOffset, Math.max(0, end - sourceOffset))
  }

  createShader(type: number): NativeShader | null {
    const handle = nativeWebGLCreateShader(type)
    return handle > 0 ? new NativeShader(handle, type) : null
  }
  shaderSource(shader: NativeShader, source: string): void {
    shader.source = source
    shaderSourceByHandle.set(nativeHandle(shader), source)
    nativeWebGLShaderSource(nativeHandle(shader), source)
  }
  compileShader(shader: NativeShader): void {
    nativeWebGLCompileShader(nativeHandle(shader))
  }
  getShaderParameter(shader: NativeShader, pname: number): boolean {
    if (pname === this.DELETE_STATUS) return false
    return nativeWebGLGetShaderParameter(nativeHandle(shader), pname) !== 0
  }
  getShaderInfoLog(_shader: NativeHandle | null): string { return '' }
  getShaderSource(shader: NativeShader): string { return shaderSourceFor(shader) }
  deleteShader(shader: NativeShader | null): void { if (shader) { shaderSourceByHandle.delete(nativeHandle(shader)); nativeWebGLDeleteShader(nativeHandle(shader)) } }

  createProgram(): NativeProgram | null {
    const handle = nativeWebGLCreateProgram()
    return handle > 0 ? new NativeProgram(handle) : null
  }
  attachShader(program: NativeProgram, shader: NativeShader): void {
    program.shaders.push(shader)
    nativeWebGLAttachShader(nativeHandle(program), nativeHandle(shader))
  }
  detachShader(program: NativeProgram, shader: NativeShader): void {
    program.shaders = program.shaders.filter((attachedShader) => attachedShader !== shader)
  }
  bindAttribLocation(_program: NativeProgram, _index: number, _name: string): void {}
  linkProgram(program: NativeProgram): void {
    nativeWebGLLinkProgram(nativeHandle(program))
  }
  useProgram(program: NativeProgram | null): void { nativeWebGLUseProgram(nullableNativeHandle(program)) }
  getProgramParameter(program: NativeProgram, pname: number): number | boolean {
    // ACTIVE_* counts are numeric — keep them off the boolifying generic path.
    if (pname === this.ACTIVE_ATTRIBUTES) return nativeWebGLGetProgramParameter(nativeHandle(program), pname)
    if (pname === this.ACTIVE_UNIFORMS) return nativeWebGLGetProgramParameter(nativeHandle(program), pname)
    if (pname === this.DELETE_STATUS) return false
    if (pname === this.ATTACHED_SHADERS) return program.shaders.length
    if (pname === this.VALIDATE_STATUS) return true
    return nativeWebGLGetProgramParameter(nativeHandle(program), pname) !== 0
  }
  getProgramInfoLog(_program: NativeProgram | null): string { return '' }
  deleteProgram(program: NativeProgram | null): void { if (program) { nativeWebGLDeleteProgram(nativeHandle(program)) } }
  validateProgram(_program: NativeProgram): void {}
  getAttachedShaders(program: NativeProgram): NativeShader[] { return program.shaders }
  getActiveAttrib(program: NativeProgram, index: number): { name: string; type: number; size: number } | null {
    return parseActiveInfoString(nativeWebGLGetActiveAttribInfo(nativeHandle(program), index))
  }
  getActiveUniform(program: NativeProgram, index: number): { name: string; type: number; size: number } | null {
    return parseActiveInfoString(nativeWebGLGetActiveUniformInfo(nativeHandle(program), index))
  }
  getAttribLocation(program: NativeProgram, name: string): number {
    return nativeWebGLGetAttribLocation(nativeHandle(program), name)
  }
  getUniformLocation(program: NativeProgram, name: string): NativeHandle {
    return createHandle('uniform', nativeWebGLGetUniformLocation(nativeHandle(program), name))
  }

  enableVertexAttribArray(index: number): void { nativeWebGLEnableVertexAttribArray(index) }
  disableVertexAttribArray(index: number): void { nativeWebGLDisableVertexAttribArray(index) }
  vertexAttribPointer(index: number, size: number, type: number, normalized: boolean, stride: number, offset: number): void {
    nativeWebGLVertexAttribPointer(index, size, type, normalized ? 1 : 0, stride, offset)
  }
  vertexAttribIPointer(index: number, size: number, type: number, stride: number, offset: number): void {
    nativeWebGLVertexAttribPointer(index, size, type, 0, stride, offset)
  }
  vertexAttribDivisor(index: number, divisor: number): void { nativeWebGLVertexAttribDivisor(index, divisor) }
  vertexAttrib1fv(_index: number, _values: BufferSourceLike): void {}
  vertexAttrib2fv(_index: number, _values: BufferSourceLike): void {}
  vertexAttrib3fv(_index: number, _values: BufferSourceLike): void {}
  vertexAttrib4fv(_index: number, _values: BufferSourceLike): void {}

  uniform1f(location: NativeHandle | null, x: number): void { nativeWebGLUniform1f(nullableNativeHandle(location), x) }
  uniform1i(location: NativeHandle | null, x: number): void { nativeWebGLUniform1i(nullableNativeHandle(location), x) }
  uniform2f(location: NativeHandle | null, x: number, y: number): void { nativeWebGLUniform2f(nullableNativeHandle(location), x, y) }
  uniform3f(location: NativeHandle | null, x: number, y: number, z: number): void { nativeWebGLUniform3f(nullableNativeHandle(location), x, y, z) }
  uniform4f(location: NativeHandle | null, x: number, y: number, z: number, w: number): void { nativeWebGLUniform4f(nullableNativeHandle(location), x, y, z, w) }
  uniformMatrix3fv(location: NativeHandle | null, transpose: boolean, value: BufferSourceLike): void {
    threeWebGLUniformMatrix3fv(nullableNativeHandle(location), 1, transpose ? 1 : 0, value)
  }
  uniformMatrix4fv(location: NativeHandle | null, transpose: boolean, value: BufferSourceLike): void {
    threeWebGLUniformMatrix4fv(nullableNativeHandle(location), 1, transpose ? 1 : 0, value)
  }
  uniform1fv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform1fv(nullableNativeHandle(location), value) }
  uniform2fv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform2fv(nullableNativeHandle(location), value) }
  uniform3fv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform3fv(nullableNativeHandle(location), value) }
  uniform4fv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform4fv(nullableNativeHandle(location), value) }
  uniform1iv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform1iv(nullableNativeHandle(location), value) }
  uniform2i(location: NativeHandle | null, x: number, y: number): void { this.uniform2f(location, x, y) }
  uniform3i(location: NativeHandle | null, x: number, y: number, z: number): void { this.uniform3f(location, x, y, z) }
  uniform4i(location: NativeHandle | null, x: number, y: number, z: number, w: number): void { this.uniform4f(location, x, y, z, w) }
  uniform2iv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform2iv(nullableNativeHandle(location), value) }
  uniform3iv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform3iv(nullableNativeHandle(location), value) }
  uniform4iv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform4iv(nullableNativeHandle(location), value) }
  uniform1ui(location: NativeHandle | null, x: number): void { this.uniform1i(location, x) }
  uniform2ui(location: NativeHandle | null, x: number, y: number): void { this.uniform2i(location, x, y) }
  uniform3ui(location: NativeHandle | null, x: number, y: number, z: number): void { this.uniform3i(location, x, y, z) }
  uniform4ui(location: NativeHandle | null, x: number, y: number, z: number, w: number): void { this.uniform4i(location, x, y, z, w) }
  uniform1uiv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform1uiv(nullableNativeHandle(location), value) }
  uniform2uiv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform2uiv(nullableNativeHandle(location), value) }
  uniform3uiv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform3uiv(nullableNativeHandle(location), value) }
  uniform4uiv(location: NativeHandle | null, value: BufferSourceLike): void { threeWebGLUniform4uiv(nullableNativeHandle(location), value) }
  uniformMatrix2fv(location: NativeHandle | null, transpose: boolean, value: BufferSourceLike): void { threeWebGLUniformMatrix2fv(nullableNativeHandle(location), 1, transpose ? 1 : 0, value) }

  createTexture(): NativeHandle { return createHandle('texture', nativeWebGLCreateTexture()) }
  deleteTexture(texture: NativeHandle | null): void { nativeWebGLDeleteTexture(nullableNativeHandle(texture)) }
  bindTexture(target: number, texture: NativeHandle | null): void { nativeWebGLBindTexture(target, nullableNativeHandle(texture)) }
  activeTexture(texture: number): void { nativeWebGLActiveTexture(texture) }
  texParameteri(target: number, pname: number, param: number): void { nativeWebGLTexParameteri(target, pname, param) }
  texParameterf(target: number, pname: number, param: number): void { nativeWebGLTexParameteri(target, pname, param) }
  pixelStorei(pname: number, param: number | boolean): void { nativeWebGLPixelStorei(pname, param === true ? 1 : param === false ? 0 : param) }
  generateMipmap(target: number): void { nativeWebGLGenerateMipmap(target) }
  texImage2D(target: number, level: number, internalFormat: number, widthOrFormat: number, heightOrType: number, borderOrSource?: number | TexImageSource | null, format?: number, type?: number, pixels?: BufferSourceLike | TexImageSource | null): void {
    if (typeof borderOrSource === 'number' && typeof format === 'number' && typeof type === 'number') {
      threeWebGLTexImage2D(target, level, internalFormat, widthOrFormat, heightOrType, format, type, pixels as BufferSourceLike)
    }
  }
  texSubImage2D(target: number, level: number, xoffset: number, yoffset: number, width: number, height: number, format: number, type: number, pixels: BufferSourceLike): void {
    threeWebGLTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels)
  }
  compressedTexImage2D(_target: number, _level: number, _internalFormat: number, _width: number, _height: number, _border: number, _data: BufferSourceLike): void {}
  compressedTexSubImage2D(_target: number, _level: number, _xoffset: number, _yoffset: number, _width: number, _height: number, _format: number, _data: BufferSourceLike): void {}
  compressedTexImage3D(_target: number, _level: number, _internalFormat: number, _width: number, _height: number, _depth: number, _border: number, _data: BufferSourceLike): void {}
  compressedTexSubImage3D(_target: number, _level: number, _xoffset: number, _yoffset: number, _zoffset: number, _width: number, _height: number, _depth: number, _format: number, _data: BufferSourceLike): void {}
  texStorage2D(target: number, levels: number, internalFormat: number, width: number, height: number): void {
    threeWebGLTexStorage2D(target, levels, internalFormat, width, height)
  }
  // Three uploads 3D and array textures only from typed `image.data` /
  // `mipmap.data` (or `null` to allocate), the same carrier the 2D uploads
  // take; no TexImageSource ever reaches these entry points.
  texImage3D(_target: number, _level: number, _internalFormat: number, _width: number, _height: number, _depth: number, _border: number, _format: number, _type: number, _source: BufferSourceLike | null): void {}
  texSubImage3D(_target: number, _level: number, _xoffset: number, _yoffset: number, _zoffset: number, _width: number, _height: number, _depth: number, _format: number, _type: number, _source: BufferSourceLike): void {}
  texStorage3D(_target: number, _levels: number, _internalFormat: number, _width: number, _height: number, _depth: number): void {}

  createVertexArray(): NativeHandle { return createHandle('vertexArray', nativeWebGLCreateVertexArray()) }
  bindVertexArray(vertexArray: NativeHandle | null): void { nativeWebGLBindVertexArray(nullableNativeHandle(vertexArray)) }
  deleteVertexArray(vertexArray: NativeHandle | null): void { nativeWebGLDeleteVertexArray(nullableNativeHandle(vertexArray)) }

  createFramebuffer(): NativeHandle { return createHandle('framebuffer', nativeWebGLCreateFramebuffer()) }
  bindFramebuffer(target: number, framebuffer: NativeHandle | null): void { nativeWebGLBindFramebuffer(target, nullableNativeHandle(framebuffer)) }
  deleteFramebuffer(framebuffer: NativeHandle | null): void { nativeWebGLDeleteFramebuffer(nullableNativeHandle(framebuffer)) }
  framebufferTexture2D(target: number, attachment: number, textarget: number, texture: NativeHandle | null, level: number): void {
    nativeWebGLFramebufferTexture2D(target, attachment, textarget, nullableNativeHandle(texture), level)
  }
  checkFramebufferStatus(target: number): number { return nativeWebGLCheckFramebufferStatus(target) }
  createRenderbuffer(): NativeHandle { return createHandle('renderbuffer', nativeWebGLCreateRenderbuffer()) }
  bindRenderbuffer(target: number, renderbuffer: NativeHandle | null): void { nativeWebGLBindRenderbuffer(target, nullableNativeHandle(renderbuffer)) }
  deleteRenderbuffer(renderbuffer: NativeHandle | null): void { nativeWebGLDeleteRenderbuffer(nullableNativeHandle(renderbuffer)) }
  renderbufferStorage(target: number, internalFormat: number, width: number, height: number): void { nativeWebGLRenderbufferStorage(target, internalFormat, width, height) }
  renderbufferStorageMultisample(target: number, samples: number, internalFormat: number, width: number, height: number): void {
    this.renderbufferStorage(target, internalFormat, width, height)
  }
  framebufferRenderbuffer(target: number, attachment: number, renderbuffertarget: number, renderbuffer: NativeHandle | null): void {
    nativeWebGLFramebufferRenderbuffer(target, attachment, renderbuffertarget, nullableNativeHandle(renderbuffer))
  }
  framebufferTextureLayer(_target: number, _attachment: number, _texture: NativeHandle | null, _level: number, _layer: number): void {}
  drawBuffers(buffers: number[]): void { nativeWebGLDrawBuffers(buffers[0] ?? this.COLOR_ATTACHMENT0) }

  clearColor(r: number, g: number, b: number, a: number): void { nativeWebGLClearColor(r, g, b, a) }
  clear(mask: number): void { nativeWebGLClear(mask) }
  clearDepth(depth: number): void { nativeWebGLClearDepth(depth) }
  clearStencil(stencil: number): void { nativeWebGLClearStencil(stencil) }
  colorMask(r: boolean, g: boolean, b: boolean, a: boolean): void { nativeWebGLColorMask(r ? 1 : 0, g ? 1 : 0, b ? 1 : 0, a ? 1 : 0) }
  depthMask(flag: boolean): void { nativeWebGLDepthMask(flag ? 1 : 0) }
  depthFunc(func: number): void { nativeWebGLDepthFunc(func) }
  enable(cap: number): void { nativeWebGLEnable(cap) }
  disable(cap: number): void { nativeWebGLDisable(cap) }
  isEnabled(_cap: number): boolean { return false }
  blendFunc(sfactor: number, dfactor: number): void { nativeWebGLBlendFunc(sfactor, dfactor) }
  blendFuncSeparate(srcRGB: number, dstRGB: number, srcAlpha: number, dstAlpha: number): void { nativeWebGLBlendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha) }
  blendEquation(mode: number): void { nativeWebGLBlendEquation(mode) }
  blendEquationSeparate(modeRGB: number, modeAlpha: number): void { nativeWebGLBlendEquationSeparate(modeRGB, modeAlpha) }
  blendColor(_red: number, _green: number, _blue: number, _alpha: number): void {}
  cullFace(mode: number): void { nativeWebGLCullFace(mode) }
  frontFace(mode: number): void { nativeWebGLFrontFace(mode) }
  viewport(x: number, y: number, width: number, height: number): void { nativeWebGLViewport(x, y, width, height) }
  scissor(x: number, y: number, width: number, height: number): void { nativeWebGLScissor(x, y, width, height) }
  lineWidth(width: number): void { nativeWebGLLineWidth(width) }
  polygonOffset(factor: number, units: number): void { nativeWebGLPolygonOffset(factor, units) }
  stencilMask(mask: number): void { nativeWebGLStencilMask(mask) }
  stencilMaskSeparate(face: number, mask: number): void { nativeWebGLStencilMaskSeparate(face, mask) }
  stencilFunc(func: number, ref: number, mask: number): void { nativeWebGLStencilFunc(func, ref, mask) }
  stencilFuncSeparate(face: number, func: number, ref: number, mask: number): void { nativeWebGLStencilFuncSeparate(face, func, ref, mask) }
  stencilOp(fail: number, zfail: number, zpass: number): void { nativeWebGLStencilOp(fail, zfail, zpass) }
  stencilOpSeparate(face: number, fail: number, zfail: number, zpass: number): void { nativeWebGLStencilOpSeparate(face, fail, zfail, zpass) }

  drawElements(mode: number, count: number, type: number, offset: number): void { nativeWebGLDrawElements(mode, count, type, offset) }
  drawArrays(mode: number, first: number, count: number): void { nativeWebGLDrawArrays(mode, first, count) }
  drawElementsInstanced(mode: number, count: number, type: number, offset: number, instanceCount: number): void { nativeWebGLDrawElementsInstanced(mode, count, type, offset, instanceCount) }
  drawArraysInstanced(mode: number, first: number, count: number, instanceCount: number): void { nativeWebGLDrawArraysInstanced(mode, first, count, instanceCount) }

  getError(): number { return nativeWebGLGetError() }
  finish(): void {}
  flush(): void {}
  hint(_target: number, _mode: number): void {}
  invalidateFramebuffer(_target: number, _attachments: BufferSourceLike): void {}
  blitFramebuffer(_srcX0: number, _srcY0: number, _srcX1: number, _srcY1: number, _dstX0: number, _dstY0: number, _dstX1: number, _dstY1: number, _mask: number, _filter: number): void {}
  readBuffer(_src: number): void {}
  readPixels(_x: number, _y: number, _width: number, _height: number, _format: number, _type: number, _destination: unknown): void {}
  copyTexImage2D(_target: number, _level: number, _internalFormat: number, _x: number, _y: number, _width: number, _height: number, _border: number): void {}
  copyTexSubImage2D(_target: number, _level: number, _xoffset: number, _yoffset: number, _x: number, _y: number, _width: number, _height: number): void {}
  copyTexSubImage3D(_target: number, _level: number, _xoffset: number, _yoffset: number, _zoffset: number, _x: number, _y: number, _width: number, _height: number): void {}
  clearBufferiv(_buffer: number, _drawbuffer: number, _values: BufferSourceLike): void {}
  clearBufferuiv(_buffer: number, _drawbuffer: number, _values: BufferSourceLike): void {}
  getBufferParameter(_target: number, _pname: number): number { return 0 }
  getBufferSubData(_target: number, _srcByteOffset: number, _destination: unknown): void {}
  getFramebufferAttachmentParameter(_target: number, _attachment: number, _pname: number): number { return 0 }
  getRenderbufferParameter(_target: number, _pname: number): number { return 0 }
  getTexParameter(_target: number, _pname: number): number { return 0 }
  getVertexAttrib(_index: number, _pname: number): number { return 0 }
  getVertexAttribOffset(_index: number, _pname: number): number { return 0 }
  getUniform(_program: NativeProgram | null, _location: NativeHandle | null): number { return 0 }
  getUniformBlockIndex(_program: NativeProgram | null, _uniformBlockName: string): number { return 0 }
  uniformBlockBinding(_program: NativeProgram | null, _uniformBlockIndex: number, _uniformBlockBinding: number): void {}
  bindBufferBase(_target: number, _index: number, _buffer: NativeHandle | null): void {}
  bindBufferRange(_target: number, _index: number, _buffer: NativeHandle | null, _offset: number, _size: number): void {}
  fenceSync(_condition: number, _flags: number): null { return null }
  clientWaitSync(_sync: NativeHandle | null, _flags: number, _timeout: number): number { return 0 }
  deleteSync(_sync: NativeHandle | null): void {}
  isBuffer(_buffer: NativeHandle | null): boolean { return true }
  isFramebuffer(_framebuffer: NativeHandle | null): boolean { return true }
  isProgram(_program: NativeProgram | null): boolean { return true }
  isRenderbuffer(_renderbuffer: NativeHandle | null): boolean { return true }
  isShader(_shader: NativeHandle | null): boolean { return true }
  isTexture(_texture: NativeHandle | null): boolean { return true }
  isVertexArray(_vertexArray: NativeHandle | null): boolean { return true }
  swapNativeBuffers(): void { nativeWebGLSwap() }
  logMissing(method: string): void { logNativeWebGL('missing WebGL method: ' + method) }
}
