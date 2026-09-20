export * from 'three/src/utils.js'

import { createNativeWebGLCanvas, type NativeWebGLCanvas } from './nativeWebGL'

/** Three's XHTML factory, narrowed to the canvas surface used by the native renderer. */
export function createElementNS(_name: string): NativeWebGLCanvas {
  return createNativeWebGLCanvas(300, 150)
}

/** Three's browser fallback, backed by the real native ANGLE canvas. */
export function createCanvasElement(): NativeWebGLCanvas { return createElementNS('canvas') }
