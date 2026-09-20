// Generic render-list instancing fixture. Reference meshes deliberately have
// observable callback overrides, so the renderer must retain ordinary draws.
import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js'
import { BoxGeometry } from 'three/src/geometries/BoxGeometry.js'
import { Color } from 'three/src/math/Color.js'
import { MeshPhongMaterial } from 'three/src/materials/MeshPhongMaterial.js'
import { Mesh } from 'three/src/objects/Mesh.js'
import { Scene } from 'three/src/scenes/Scene.js'
import { AmbientLight } from 'three/src/lights/AmbientLight.js'
import { DirectionalLight } from 'three/src/lights/DirectionalLight.js'
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'
import { createNativeWebGLCanvas } from '../src/nativeWebGL'
import { nativeWebGLSwap, syncNativeWebGLSize } from '../src/nativeWebGLHost'

export function startRealThreeFrameLoop(width: number, height: number, aspect: number): void {
  const canvas = createNativeWebGLCanvas(width, height)
  const context = canvas.getContext('webgl2')
  if (!context) throw new Error('Native instancing validation requires a WebGL2 context')
  const renderer = new WebGLRenderer({canvas, context, antialias:false, alpha:false, depth:true, stencil:true})
  renderer.setPixelRatio(1)
  renderer.setSize(width,height,false)
  renderer.setClearColor(new Color(0x102030),1)
  const camera = new PerspectiveCamera(55,aspect,.1,100)
  camera.position.z = 7
  const reference = new Scene()
  const candidate = new Scene()
  const geometry = new BoxGeometry(1.25,1.25,1.25)
  const material = new MeshPhongMaterial({color:0xff6010,flatShading:false})
  const instances: Mesh[] = []
  let callbacks = 0
  for (let i=0;i<2;i++) {
    const original = new Mesh(geometry,material)
    original.position.set(i===0?-1.25:1.25,0,0)
    original.scale.set(1,i===0?.75:1.25,.5)
    original.rotation.x = Math.PI / 2
    original.onBeforeRender = () => { callbacks++ }
    reference.add(original)
    const mesh = new Mesh(geometry,material)
    mesh.position.copy(original.position)
    mesh.scale.copy(original.scale)
    mesh.rotation.copy(original.rotation)
    candidate.add(mesh)
    instances.push(mesh)
  }
  reference.add(new AmbientLight(0xffffff, .5))
  candidate.add(new AmbientLight(0xffffff, .5))
  const light = new DirectionalLight(0xffffff,2)
  light.position.set(3,5,7)
  reference.add(light)
  const light2 = new DirectionalLight(0xffffff,2)
  light2.position.copy(light.position)
  candidate.add(light2)
  let frame=0
  function renderFrame(): void {
    frame++
    camera.aspect=syncNativeWebGLSize(aspect)
    camera.updateProjectionMatrix()
    if(frame===241) instances[0].visible=false
    renderer.render(frame<121?reference:candidate,camera)
    if(frame===90||frame===180||frame===300) console.error('[auto.instance]',frame,renderer.info.render.calls,renderer.info.render.triangles,callbacks)
    nativeWebGLSwap()
    if(frame<301) requestAnimationFrame(renderFrame)
    else console.error('[batch.render] complete')
  }
  requestAnimationFrame(renderFrame)
}
