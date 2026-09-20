// Rendered by the existing Three ANGLE Metal app shell through the test-only
// wrapper plugin. The two scenes must produce identical framebuffer pixels.
import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js'
import { BoxGeometry } from 'three/src/geometries/BoxGeometry.js'
import { Color } from 'three/src/math/Color.js'
import { Matrix4 } from 'three/src/math/Matrix4.js'
import { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { BatchedMesh } from 'three/src/objects/BatchedMesh.js'
import { Scene } from 'three/src/scenes/Scene.js'
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'
import { createNativeWebGLCanvas } from '../src/nativeWebGL'
import { nativeWebGLSwap, syncNativeWebGLSize } from '../src/nativeWebGLHost'

export function startRealThreeFrameLoop(width: number, height: number, aspect: number): void {
  const canvas = createNativeWebGLCanvas(width, height)
  const context = canvas.getContext('webgl2')
  if (!context) throw new Error('Native batching validation requires a WebGL2 context')
  const renderer = new WebGLRenderer({ canvas, context, antialias: false, alpha: false, depth: true, stencil: true })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  renderer.setClearColor(new Color(0x102030), 1)
  const camera = new PerspectiveCamera(55, aspect, 0.1, 100)
  camera.position.z = 7
  const reference = new Scene()
  const candidate = new Scene()
  const geometry = new BoxGeometry(1.25, 1.25, 1.25)
  const colors = [new Color(0xff4010), new Color(0x20c0ff)]
  const batch = new BatchedMesh(4, 128, 256, new MeshBasicMaterial({ color: 0xffffff }))
  const geometryId = batch.addGeometry(geometry)
  for (let i = 0; i < 2; i++) {
    const matrix = new Matrix4().makeTranslation(i === 0 ? -1 : 1, 0, 0)
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ color: colors[i] }))
    mesh.applyMatrix4(matrix)
    reference.add(mesh)
    const instance = batch.addInstance(geometryId)
    batch.setMatrixAt(instance, matrix)
    batch.setColorAt(instance, colors[i])
  }
  candidate.add(batch)
  let frame = 0
  function renderFrame(): void {
    frame++
    camera.aspect = syncNativeWebGLSize(aspect)
    camera.updateProjectionMatrix()
    // The existing native host dumps frames 90, 180 and 300. The last frame
    // verifies that hiding one instance removes its draw without stale pixels.
    if (frame === 241) batch.setVisibleAt(0, false)
    renderer.render(frame < 121 ? reference : candidate, camera)
    if (frame === 90 || frame === 180 || frame === 300) {
      console.error('[batch.render]', frame, renderer.info.render.calls, renderer.info.render.triangles, batch._multiDrawCount)
    }
    nativeWebGLSwap()
    if (frame < 301) requestAnimationFrame(renderFrame)
    else console.error('[batch.render] complete')
  }
  requestAnimationFrame(renderFrame)
}
