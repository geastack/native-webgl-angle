/// <reference path="./gea-native-types.d.ts" />

import type { NSView } from '@geastack/apple/AppKit'

export function attachNativeWebGL(
  hostView: NSView,
  width: number,
  height: number,
  devicePixelRatio: number,
): boolean {
  return threeWebGLAttach(hostView, width, height, devicePixelRatio)
}

export function syncNativeWebGLSize(fallbackAspect: number): number {
  return threeWebGLSyncSize(fallbackAspect)
}

export function nativeWebGLWidth(): number {
  return threeWebGLWidth()
}

export function nativeWebGLHeight(): number {
  return threeWebGLHeight()
}

// The host's actual backing scale (window.devicePixelRatio analog).
// nativeWebGLWidth/Height report DEVICE pixels; divide by this for the
// CSS-pixel (logical) size that web layout math (HUD ortho camera,
// troika fontSize) expects.
export function nativeWebGLDevicePixelRatio(): number {
  return threeWebGLDevicePixelRatio()
}

export function nativeWebGLSwap(): void {
  threeWebGLSwap()
}

export function logNativeWebGL(message: string): void {
  threeAngleSmokeLog(message)
}

// Whether a macOS hardware key (virtual key code, 0-127) is currently held.
// Backed by the host NSView's keyDown:/keyUp: state; drives native input.
export function nativeKeyPressed(code: number): boolean {
  return threeKeyPressed(code)
}

export function nativeGamepadState(channel: number): number {
  return threeGamepadState(channel)
}

// Native pointer state (macOS host), the mouse twin of nativeKeyPressed.
// Channels: 0=x, 1=y (view coordinates, TOP-LEFT origin — clientX/clientY
// semantics), 2=view width, 3=view height (same units as x/y), 4=move
// sequence (changes on every pointer event; 0 = pointer never seen),
// 5=primary button (1 = down). Backed by the host NSView's NSTrackingArea
// mouseMoved:/mouseDragged:/mouseDown:/mouseUp: handlers. Also drivable
// headlessly via GEA_THREE_SYNTH_POINTER="x0,y0:x1,y1:startMs:endMs"
// (normalized [0,1] coordinates, reported with width=height=1).
export function nativePointerState(channel: number): number {
  return threePointerState(channel)
}

export function nativeWebGLCreateBuffer(): number { return threeWebGLCreateBuffer() }
export function nativeWebGLDeleteBuffer(buffer: number): void { threeWebGLDeleteBuffer(buffer) }
export function nativeWebGLBindBuffer(target: number, buffer: number): void { threeWebGLBindBuffer(target, buffer) }

export function nativeWebGLCreateShader(type: number): number { return threeWebGLCreateShader(type) }
export function nativeWebGLShaderSource(shader: number, source: string): void { threeWebGLShaderSource(shader, source) }
export function nativeWebGLCompileShader(shader: number): void { threeWebGLCompileShader(shader) }
export function nativeWebGLGetShaderParameter(shader: number, pname: number): number { return threeWebGLGetShaderParameter(shader, pname) }
export function nativeWebGLDeleteShader(shader: number): void { threeWebGLDeleteShader(shader) }

export function nativeWebGLCreateProgram(): number { return threeWebGLCreateProgram() }
export function nativeWebGLAttachShader(program: number, shader: number): void { threeWebGLAttachShader(program, shader) }
export function nativeWebGLLinkProgram(program: number): void { threeWebGLLinkProgram(program) }
export function nativeWebGLGetProgramParameter(program: number, pname: number): number { return threeWebGLGetProgramParameter(program, pname) }
export function nativeWebGLDeleteProgram(program: number): void { threeWebGLDeleteProgram(program) }
export function nativeWebGLUseProgram(program: number): void { threeWebGLUseProgram(program) }
export function nativeWebGLGetAttribLocation(program: number, name: string): number { return threeWebGLGetAttribLocation(program, name) }
export function nativeWebGLGetUniformLocation(program: number, name: string): number { return threeWebGLGetUniformLocation(program, name) }
// Driver-truth active uniform/attrib reflection, serialized "name|type|size"
// ("" past the end). Mirrors glGetActiveUniform/glGetActiveAttrib semantics
// exactly (struct-array member expansion, "name[0]" array reporting).
export function nativeWebGLGetActiveUniformInfo(program: number, index: number): string { return threeWebGLGetActiveUniformInfo(program, index) }
export function nativeWebGLGetActiveAttribInfo(program: number, index: number): string { return threeWebGLGetActiveAttribInfo(program, index) }

export function nativeWebGLEnableVertexAttribArray(index: number): void { threeWebGLEnableVertexAttribArray(index) }
export function nativeWebGLDisableVertexAttribArray(index: number): void { threeWebGLDisableVertexAttribArray(index) }
export function nativeWebGLVertexAttribPointer(index: number, size: number, type: number, normalized: number, stride: number, offset: number): void { threeWebGLVertexAttribPointer(index, size, type, normalized, stride, offset) }

export function nativeWebGLUniform1f(location: number, x: number): void { threeWebGLUniform1f(location, x) }
export function nativeWebGLUniform1i(location: number, x: number): void { threeWebGLUniform1i(location, x) }
export function nativeWebGLUniform2f(location: number, x: number, y: number): void { threeWebGLUniform2f(location, x, y) }
export function nativeWebGLUniform3f(location: number, x: number, y: number, z: number): void { threeWebGLUniform3f(location, x, y, z) }
export function nativeWebGLUniform4f(location: number, x: number, y: number, z: number, w: number): void { threeWebGLUniform4f(location, x, y, z, w) }

export function nativeWebGLCreateTexture(): number { return threeWebGLCreateTexture() }
export function nativeWebGLDeleteTexture(texture: number): void { threeWebGLDeleteTexture(texture) }
export function nativeWebGLBindTexture(target: number, texture: number): void { threeWebGLBindTexture(target, texture) }
export function nativeWebGLActiveTexture(texture: number): void { threeWebGLActiveTexture(texture) }
export function nativeWebGLTexParameteri(target: number, pname: number, param: number): void { threeWebGLTexParameteri(target, pname, param) }
export function nativeWebGLPixelStorei(pname: number, param: number): void { threeWebGLPixelStorei(pname, param) }
export function nativeWebGLGenerateMipmap(target: number): void { threeWebGLGenerateMipmap(target) }

export function nativeWebGLCreateVertexArray(): number { return threeWebGLCreateVertexArray() }
export function nativeWebGLBindVertexArray(vertexArray: number): void { threeWebGLBindVertexArray(vertexArray) }
export function nativeWebGLDeleteVertexArray(vertexArray: number): void { threeWebGLDeleteVertexArray(vertexArray) }

export function nativeWebGLCreateFramebuffer(): number { return threeWebGLCreateFramebuffer() }
export function nativeWebGLBindFramebuffer(target: number, framebuffer: number): void { threeWebGLBindFramebuffer(target, framebuffer) }
export function nativeWebGLDeleteFramebuffer(framebuffer: number): void { threeWebGLDeleteFramebuffer(framebuffer) }
export function nativeWebGLFramebufferTexture2D(target: number, attachment: number, textarget: number, texture: number, level: number): void { threeWebGLFramebufferTexture2D(target, attachment, textarget, texture, level) }
export function nativeWebGLCheckFramebufferStatus(target: number): number { return threeWebGLCheckFramebufferStatus(target) }
export function nativeWebGLCreateRenderbuffer(): number { return threeWebGLCreateRenderbuffer() }
export function nativeWebGLBindRenderbuffer(target: number, renderbuffer: number): void { threeWebGLBindRenderbuffer(target, renderbuffer) }
export function nativeWebGLDeleteRenderbuffer(renderbuffer: number): void { threeWebGLDeleteRenderbuffer(renderbuffer) }
export function nativeWebGLRenderbufferStorage(target: number, internalFormat: number, width: number, height: number): void { threeWebGLRenderbufferStorage(target, internalFormat, width, height) }
export function nativeWebGLFramebufferRenderbuffer(target: number, attachment: number, renderbuffertarget: number, renderbuffer: number): void { threeWebGLFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) }
export function nativeWebGLDrawBuffers(attachment: number): void { threeWebGLDrawBuffers(attachment) }

export function nativeWebGLClearColor(r: number, g: number, b: number, a: number): void { threeWebGLClearColor(r, g, b, a) }
export function nativeWebGLClear(mask: number): void { threeWebGLClear(mask) }
export function nativeWebGLClearDepth(depth: number): void { threeWebGLClearDepth(depth) }
export function nativeWebGLClearStencil(stencil: number): void { threeWebGLClearStencil(stencil) }
export function nativeWebGLColorMask(r: number, g: number, b: number, a: number): void { threeWebGLColorMask(r, g, b, a) }
export function nativeWebGLDepthMask(flag: number): void { threeWebGLDepthMask(flag) }
export function nativeWebGLDepthFunc(func: number): void { threeWebGLDepthFunc(func) }
export function nativeWebGLEnable(cap: number): void { threeWebGLEnable(cap) }
export function nativeWebGLDisable(cap: number): void { threeWebGLDisable(cap) }
export function nativeWebGLBlendFunc(sfactor: number, dfactor: number): void { threeWebGLBlendFunc(sfactor, dfactor) }
export function nativeWebGLBlendFuncSeparate(srcRGB: number, dstRGB: number, srcAlpha: number, dstAlpha: number): void { threeWebGLBlendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha) }
export function nativeWebGLBlendEquation(mode: number): void { threeWebGLBlendEquation(mode) }
export function nativeWebGLBlendEquationSeparate(modeRGB: number, modeAlpha: number): void { threeWebGLBlendEquationSeparate(modeRGB, modeAlpha) }
export function nativeWebGLCullFace(mode: number): void { threeWebGLCullFace(mode) }
export function nativeWebGLFrontFace(mode: number): void { threeWebGLFrontFace(mode) }
export function nativeWebGLViewport(x: number, y: number, width: number, height: number): void { threeWebGLViewport(x, y, width, height) }
export function nativeWebGLScissor(x: number, y: number, width: number, height: number): void { threeWebGLScissor(x, y, width, height) }
export function nativeWebGLLineWidth(width: number): void { threeWebGLLineWidth(width) }
export function nativeWebGLPolygonOffset(factor: number, units: number): void { threeWebGLPolygonOffset(factor, units) }
export function nativeWebGLStencilMask(mask: number): void { threeWebGLStencilMask(mask) }
export function nativeWebGLStencilMaskSeparate(face: number, mask: number): void { threeWebGLStencilMaskSeparate(face, mask) }
export function nativeWebGLStencilFunc(func: number, ref: number, mask: number): void { threeWebGLStencilFunc(func, ref, mask) }
export function nativeWebGLStencilFuncSeparate(face: number, func: number, ref: number, mask: number): void { threeWebGLStencilFuncSeparate(face, func, ref, mask) }
export function nativeWebGLStencilOp(fail: number, zfail: number, zpass: number): void { threeWebGLStencilOp(fail, zfail, zpass) }
export function nativeWebGLStencilOpSeparate(face: number, fail: number, zfail: number, zpass: number): void { threeWebGLStencilOpSeparate(face, fail, zfail, zpass) }
export function nativeWebGLDrawElements(mode: number, count: number, type: number, offset: number): void { threeWebGLDrawElements(mode, count, type, offset) }
export function nativeWebGLDrawArrays(mode: number, first: number, count: number): void { threeWebGLDrawArrays(mode, first, count) }
export function nativeWebGLGetError(): number { return threeWebGLGetError() }

/** Lifecycle entry: retains/uses the host view and installs native monitors; not an inert call. */
declare function threeWebGLAttach(view: NSView, width: number, height: number, devicePixelRatio: number): boolean
/** Lifecycle entry: synchronizes host layout and viewport state; keep outside the inert contract. */
declare function threeWebGLSyncSize(fallbackAspect: number): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLWidth(): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLHeight(): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDevicePixelRatio(): number
/** Lifecycle entry: presents the native surface and may run platform hooks; not an inert call. */
declare function threeWebGLSwap(): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeAngleSmokeLog(message: string): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeKeyPressed(code: number): boolean
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threePointerState(channel: number): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLCreateBuffer(): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDeleteBuffer(buffer: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLBindBuffer(target: number, buffer: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLCreateShader(type: number): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLShaderSource(shader: number, source: string): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLCompileShader(shader: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLGetShaderParameter(shader: number, pname: number): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDeleteShader(shader: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLCreateProgram(): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLAttachShader(program: number, shader: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLLinkProgram(program: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLGetProgramParameter(program: number, pname: number): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDeleteProgram(program: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLUseProgram(program: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLGetAttribLocation(program: number, name: string): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLGetUniformLocation(program: number, name: string): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLGetActiveUniformInfo(program: number, index: number): string
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLGetActiveAttribInfo(program: number, index: number): string
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLEnableVertexAttribArray(index: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDisableVertexAttribArray(index: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLVertexAttribPointer(index: number, size: number, type: number, normalized: number, stride: number, offset: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLUniform1f(location: number, x: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLUniform1i(location: number, x: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLUniform2f(location: number, x: number, y: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLUniform3f(location: number, x: number, y: number, z: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLUniform4f(location: number, x: number, y: number, z: number, w: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLCreateTexture(): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDeleteTexture(texture: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLBindTexture(target: number, texture: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLActiveTexture(texture: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLTexParameteri(target: number, pname: number, param: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLPixelStorei(pname: number, param: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLGenerateMipmap(target: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLCreateVertexArray(): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLBindVertexArray(vertexArray: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDeleteVertexArray(vertexArray: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLCreateFramebuffer(): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLBindFramebuffer(target: number, framebuffer: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDeleteFramebuffer(framebuffer: number): void
/** @gea-host-inert Copies scalar arguments into GL state; retains no script references and invokes no script. */
declare function threeWebGLFramebufferTexture2D(target: number, attachment: number, textarget: number, texture: number, level: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLCheckFramebufferStatus(target: number): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLCreateRenderbuffer(): number
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLBindRenderbuffer(target: number, renderbuffer: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDeleteRenderbuffer(renderbuffer: number): void
/** @gea-host-inert Copies scalar arguments into GL state; retains no script references and invokes no script. */
declare function threeWebGLRenderbufferStorage(target: number, internalFormat: number, width: number, height: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLFramebufferRenderbuffer(target: number, attachment: number, renderbuffertarget: number, renderbuffer: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDrawBuffers(attachment: number): void
/** @gea-host-inert Copies scalar arguments into GL state; retains no script references and invokes no script. */
declare function threeWebGLClearColor(r: number, g: number, b: number, a: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLClear(mask: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLClearDepth(depth: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLClearStencil(stencil: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLColorMask(r: number, g: number, b: number, a: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDepthMask(flag: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDepthFunc(func: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLEnable(cap: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDisable(cap: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLBlendFunc(sfactor: number, dfactor: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLBlendFuncSeparate(srcRGB: number, dstRGB: number, srcAlpha: number, dstAlpha: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLBlendEquation(mode: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLBlendEquationSeparate(modeRGB: number, modeAlpha: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLCullFace(mode: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLFrontFace(mode: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLViewport(x: number, y: number, width: number, height: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLScissor(x: number, y: number, width: number, height: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLLineWidth(width: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLPolygonOffset(factor: number, units: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLStencilMask(mask: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLStencilMaskSeparate(face: number, mask: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLStencilFunc(func: number, ref: number, mask: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLStencilFuncSeparate(face: number, func: number, ref: number, mask: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLStencilOp(fail: number, zfail: number, zpass: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLStencilOpSeparate(face: number, fail: number, zfail: number, zpass: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDrawElements(mode: number, count: number, type: number, offset: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDrawArrays(mode: number, first: number, count: number): void
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLGetError(): number

// The host compiles these markers out of normal builds.
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeNativeProfilePhase(phase: number): void
export function nativeProfilePhase(phase: number): void { threeNativeProfilePhase(phase) }

export function nativeWebGLVertexAttribDivisor(index: number, divisor: number): void { threeWebGLVertexAttribDivisor(index, divisor) }
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLVertexAttribDivisor(index: number, divisor: number): void
export function nativeWebGLDrawElementsInstanced(mode: number, count: number, type: number, offset: number, instanceCount: number): void { threeWebGLDrawElementsInstanced(mode, count, type, offset, instanceCount) }
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDrawElementsInstanced(mode: number, count: number, type: number, offset: number, instanceCount: number): void
export function nativeWebGLDrawArraysInstanced(mode: number, first: number, count: number, instanceCount: number): void { threeWebGLDrawArraysInstanced(mode, first, count, instanceCount) }
/** @gea-host-inert Native state only; retains no script references and invokes no script. */
declare function threeWebGLDrawArraysInstanced(mode: number, first: number, count: number, instanceCount: number): void
