import { ArrayCamera } from 'three/src/cameras/ArrayCamera.js'
import { EventDispatcher } from 'three/src/core/EventDispatcher.js'
import type { Camera } from 'three/src/cameras/Camera.js'
import type { Mesh } from 'three/src/objects/Mesh.js'
import type { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'
import type { NativeWebGL2RenderingContext } from './nativeWebGL'

/**
 * The XR surface WebGLRenderer needs on an Apple-native target.
 *
 * WebXR is a browser device API and no Apple-native host object implements it.
 * Keeping the manager present, permanently non-presenting, preserves Three's
 * renderer contract without pulling its browser-only XR session/controller
 * graph into the native program.
 */
export class WebXRManager extends EventDispatcher {
  cameraAutoUpdate = true
  enabled = false
  readonly isPresenting = false

  private readonly camera = new ArrayCamera()

  constructor(_renderer: WebGLRenderer, _gl: NativeWebGL2RenderingContext) {
    super()
  }

  updateCamera(_camera: Camera): void {}

  getCamera(): ArrayCamera {
    return this.camera
  }

  hasDepthSensing(): boolean {
    return false
  }

  getDepthSensingMesh(): Mesh | null {
    return null
  }

  getEnvironmentBlendMode(): string {
    return 'opaque'
  }

  setAnimationLoop<T>(_callback: T | null): void {}

  dispose(): void {}
}
