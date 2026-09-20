import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as THREE from '../node_modules/three/build/three.module.js'
import plugin from '../geatsc-plugin.mjs'
import { nativeInstanceHelpers, transformCanonicalInstanceHooks } from '../geatsc-plugin-instancing.mjs'

const fileName = fileURLToPath(new URL('../node_modules/three/src/renderers/WebGLRenderer.js', import.meta.url))
const text = fs.readFileSync(fileName, 'utf8')
const transform = plugin.configure().hostShims.transformSource
const previous = process.env.GEA_WEBGL_AUTO_INSTANCE
process.env.GEA_WEBGL_AUTO_INSTANCE = '0'
assert.doesNotMatch(transform({fileName, text}), /nativeInstancePool/)
process.env.GEA_WEBGL_AUTO_INSTANCE = '1'
const source = transform({fileName, text})
if (previous === undefined) delete process.env.GEA_WEBGL_AUTO_INSTANCE
else process.env.GEA_WEBGL_AUTO_INSTANCE = previous
assert.ok(source.startsWith('// @ts-nocheck\n'))
const start = source.indexOf('\t\tconst nativeInstanceMatrix')
const end = source.indexOf('\n\t\tfunction renderObject(', start)
assert.ok(start > 0 && end > start)
const cleanupStart = source.indexOf('if (renderListStack.length === 1) {')
const cleanupEnd = source.indexOf('bindingStates.resetDefaultState();', cleanupStart)
const cleanup = source.slice(cleanupStart, cleanupEnd)
const reset = 'if (renderListStack.length === 0) nativeInstanceUsed = 0;'
assert.ok(source.includes(reset))
const draws = []
const uploads = []
const build = new Function('InstancedMesh', 'Mesh', 'Matrix4', 'InstancedBufferAttribute', 'InterleavedBufferAttribute', 'InstancedInterleavedBuffer', 'nativeInstanceBeforeRender', 'nativeInstanceAfterRender', 'nativeInstanceMaterialBeforeRender', 'nativeInstanceBeforeCompile', 'nativeInstanceProgramCacheKey', 'renderObject', 'objects', 'attributes', '_gl', '_this', 'currentRenderState',
  `${nativeInstanceHelpers}\n${source.slice(start,end)}\nreturn {renderObjects, nativeInstancePool, beginRender(depth=0){const renderListStack=Array(depth); ${reset}}, endRender(depth=1){const renderListStack=Array(depth); ${cleanup}}};`)
const rendererState = {localClippingEnabled:false}
const renderState = {state:{lightProbeGridArray:[]}}
const {renderObjects, nativeInstancePool, beginRender, endRender} = build(THREE.InstancedMesh, THREE.Mesh, THREE.Matrix4, THREE.InstancedBufferAttribute, THREE.InterleavedBufferAttribute, THREE.InstancedInterleavedBuffer, THREE.Object3D.prototype.onBeforeRender, THREE.Object3D.prototype.onAfterRender, THREE.Material.prototype.onBeforeRender, THREE.Material.prototype.onBeforeCompile, THREE.Material.prototype.customProgramCacheKey,
  (object, scene, camera, geometry, material, group) => {
    if (object.isInstancedMesh) {
      draws.push({object, origin:object.matrixWorld.clone(), count: object.count, matrices: [...object.instanceMatrix.array].slice(0, object.count * 16), geometry, material, group})
    } else draws.push({object, count: 1, geometry, material, group})
  }, {update() {}}, {update: attribute => uploads.push(attribute.version)}, {ARRAY_BUFFER: 34962}, rendererState, renderState)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera()
const geometry = new THREE.BoxGeometry()
const material = new THREE.MeshPhongMaterial()
const make = x => {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, x / 2, -5)
  mesh.rotation.set(.2,.3,.4)
  mesh.scale.set(1,2,3)
  mesh.updateMatrixWorld()
  scene.add(mesh)
  return {id: mesh.id, object: mesh, geometry, material, groupOrder: 0, renderOrder: 0, materialVariant: 0, z: x, group: null}
}
const a = make(1), b = make(2), c = make(3)
const render = list => { draws.length = 0; renderObjects(list,scene,camera); return draws }
assert.equal(render([a,b,c]).length, 1)
assert.equal(draws[0].count, 3)
assert.equal(draws[0].object.receiveShadow, false)
for (let i=0;i<3;i++) {
  const expected = [a,b,c][i].object.matrixWorld.clone()
  expected.elements[12] -= camera.matrixWorld.elements[12]
  expected.elements[13] -= camera.matrixWorld.elements[13]
  expected.elements[14] -= camera.matrixWorld.elements[14]
  assert.deepEqual(draws[0].matrices.slice(i*16,(i+1)*16), [...new Float32Array(expected.elements)])
}
assert.equal(scene.children.length, 3)
assert.equal(a.object.parent, scene)
assert.equal(nativeInstancePool.length, 1)
const pooled = nativeInstancePool[0]
b.object.position.y += 8
b.object.updateMatrixWorld()
render([a,b])
assert.equal(nativeInstancePool[0], pooled)
assert.equal(draws[0].count, 2)
assert.equal(draws[0].matrices[16+13] + draws[0].origin.elements[13], b.object.matrixWorld.elements[13])
assert.equal(uploads.length, 2, 'each render view uploads changed instance matrices')
assert.equal(uploads[1], uploads[0] + 1)

// Adjacent order is retained; don't reorder across distinct materials/groups.
const distinct = {...b, material: new THREE.MeshPhongMaterial()}
assert.deepEqual(render([a,distinct,c]).map(d=>d.object), [a.object,b.object,c.object])
// Shared-geometry/material runs are the only reason to enumerate attributes.
// Unrelated ordinary draws must not pay allocation costs for a failed batch.
const originalKeys = Object.keys
let attributeEnumerations = 0
Object.keys = value => {
  if (value === geometry.attributes || value === geometry.morphAttributes) attributeEnumerations++
  return originalKeys(value)
}
try {
  render([a,distinct,c])
  assert.equal(attributeEnumerations,0)
  render([a,b,c])
  assert.equal(attributeEnumerations,2,'geometry eligibility is checked once per shared run')
} finally {
  Object.keys = originalKeys
}
assert.equal(render([a,{...b, group:{start:0,count:3}},c]).length, 3)
assert.equal(render([a,{...b, groupOrder:1},c]).length, 3)
assert.equal(render([a,{...b, renderOrder:1},c]).length, 3)
b.object.receiveShadow = true
assert.equal(render([a,b,c]).length, 3)
b.object.receiveShadow = false
b.object.layers.set(1)
assert.deepEqual(render([a,b,c]).map(d=>d.object), [a.object,c.object])
b.object.layers.set(0)

const fallback = (setup, cleanup) => { setup(); assert.equal(render([a,b]).length,2); cleanup() }
fallback(()=>rendererState.localClippingEnabled=true,()=>rendererState.localClippingEnabled=false)
fallback(()=>renderState.state.lightProbeGridArray.push({}),()=>renderState.state.lightProbeGridArray.length=0)
fallback(()=>geometry.setAttribute('extra',new THREE.InstancedBufferAttribute(new Float32Array(2),1)),()=>geometry.deleteAttribute('extra'))
fallback(()=>geometry.setAttribute('extra',new THREE.InterleavedBufferAttribute(new THREE.InstancedInterleavedBuffer(new Float32Array(2),1),1,0)),()=>geometry.deleteAttribute('extra'))
fallback(()=>geometry.isInstancedBufferGeometry=true,()=>delete geometry.isInstancedBufferGeometry)
fallback(()=>material.transparent=true,()=>material.transparent=false)
fallback(()=>material.depthWrite=false,()=>material.depthWrite=true)
fallback(()=>material.depthTest=false,()=>material.depthTest=true)
fallback(()=>material.stencilWrite=true,()=>material.stencilWrite=false)
fallback(()=>material.wireframe=true,()=>material.wireframe=false)
fallback(()=>material.blending=THREE.AdditiveBlending,()=>material.blending=THREE.NormalBlending)
fallback(()=>{material.normalMap=new THREE.Texture(); material.normalMapType=THREE.ObjectSpaceNormalMap},()=>{material.normalMap=null; material.normalMapType=THREE.TangentSpaceNormalMap})
material.normalMap=new THREE.Texture()
assert.equal(render([a,b]).length,1,'ordinary tangent-space normal maps retain instancing support')
material.normalMap=null
fallback(()=>a.object.onBeforeRender=()=>{},()=>delete a.object.onBeforeRender)
fallback(()=>a.object.onAfterRender=()=>{},()=>delete a.object.onAfterRender)
fallback(()=>material.onBeforeRender=()=>{},()=>delete material.onBeforeRender)
fallback(()=>material.onBeforeCompile=()=>{},()=>delete material.onBeforeCompile)
fallback(()=>material.customProgramCacheKey=()=>'',()=>delete material.customProgramCacheKey)
fallback(()=>a.object.isSkinnedMesh=true,()=>delete a.object.isSkinnedMesh)
fallback(()=>a.object.isBatchedMesh=true,()=>delete a.object.isBatchedMesh)
fallback(()=>a.object.morphTargetInfluences=[1],()=>delete a.object.morphTargetInfluences)
fallback(()=>geometry.morphAttributes.position=[geometry.attributes.position],()=>delete geometry.morphAttributes.position)
fallback(()=>scene.overrideMaterial=new THREE.MeshBasicMaterial(),()=>scene.overrideMaterial=null)
fallback(()=>a.object.matrixWorld.makeScale(-1,1,1),()=>a.object.updateMatrixWorld())
fallback(()=>a.object.matrixWorld.makeScale(0,1,1),()=>a.object.updateMatrixWorld())
fallback(()=>a.object.matrixWorld.elements[3]=.2,()=>a.object.updateMatrixWorld())
fallback(()=>a.object.matrixWorld.makeShear(.2,0,0,0,0,0),()=>a.object.updateMatrixWorld())
const alreadyInstanced = new THREE.InstancedMesh(geometry,material,2)
assert.equal(render([{...a,object:alreadyInstanced},b]).length,2)
const physical = new THREE.MeshPhysicalMaterial()
assert.equal(render([{...a,material:physical},{...b,material:physical}]).length,2)
const shader = new THREE.ShaderMaterial()
shader.type = 'MeshPhongMaterial'
assert.equal(render([{...a,material:shader},{...b,material:shader}]).length,2)

// Prototype hooks installed after the source modules initialize cannot be
// mistaken for the canonical no-op, even for newly constructed meshes.
fallback(()=>THREE.InstancedMesh.prototype.onBeforeRender=()=>{},()=>delete THREE.InstancedMesh.prototype.onBeforeRender)
fallback(()=>THREE.InstancedMesh.prototype.onAfterRender=()=>{},()=>delete THREE.InstancedMesh.prototype.onAfterRender)
const oldHook = THREE.Object3D.prototype.onBeforeRender
fallback(()=>THREE.Object3D.prototype.onBeforeRender=()=>{},()=>THREE.Object3D.prototype.onBeforeRender=oldHook)
const near = make(100000000), next = make(100000001)
camera.position.set(100000000,50000000,0)
camera.updateMatrixWorld()
render([near,next])
assert.equal(draws.length,1)
assert.equal(draws[0].matrices[28],1)
assert.equal(draws[0].matrices[28]+draws[0].origin.elements[12],100000001)
camera.position.set(0,0,0)
camera.updateMatrixWorld()
// The first object can be distant while a later object is near the camera.
// Anchoring at the first object loses the latter's translation in Float32.
const farFirst = make(0), nearSecond = make(0)
farFirst.object.position.set(0,0,-100000000)
nearSecond.object.position.set(0,0,-1)
farFirst.object.updateMatrixWorld()
nearSecond.object.updateMatrixWorld()
render([farFirst,nearSecond])
assert.equal(draws.length,1)
const batchView = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse,draws[0].origin)
const shaderZ = Math.fround(Math.fround(batchView.elements[14]) + draws[0].matrices[30])
assert.equal(shaderZ,-1,'camera-relative Float32 coordinates preserve the nearby second instance')

// Capacity growth releases only the renderer's own buffer; shared scene
// geometry/material objects and ordinary per-object matrices remain valid.
let disposed = 0
pooled.addEventListener('dispose',()=>disposed++)
const many = Array.from({length:33},(_,i)=>make(i))
assert.equal(render(many).length,1)
assert.equal(draws[0].count,33)
assert.equal(disposed,1)
assert.equal(nativeInstancePool[0].geometry,geometry)
assert.deepEqual(a.object.modelViewMatrix.elements,a.object.matrixWorld.elements)
assert.match(source, /for \(let i = 0; i < nativeInstancePool.length; i\+\+\) nativeInstancePool\[i\].dispose\(\);/)
let released = 0
nativeInstancePool[0].addEventListener('dispose',()=>released++)
beginRender()
render([])
endRender()
assert.equal(nativeInstancePool.length,0,'a new empty scene releases old pooled geometry/material references')
assert.equal(released,1)
// Opaque and later passes share a usage high-water mark. A nested render
// must neither reset that mark nor release the outer render's pool slots.
const d = make(4), e = make(5)
const secondMaterial = new THREE.MeshPhongMaterial({color:0xff8800})
d.material = e.material = d.object.material = e.object.material = secondMaterial
beginRender()
render([a,b,d,e])
assert.equal(draws.length,2)
assert.equal(nativeInstancePool.length,2)
const firstSlot = nativeInstancePool[0], secondSlot = nativeInstancePool[1]
let firstReleased=0, secondReleased=0, sharedDisposed=0
firstSlot.addEventListener('dispose',()=>firstReleased++)
secondSlot.addEventListener('dispose',()=>secondReleased++)
geometry.addEventListener('dispose',()=>sharedDisposed++)
material.addEventListener('dispose',()=>sharedDisposed++)
render([]) // a later transparent pass with no eligible draws
beginRender(1)
render([]) // a nested render with no candidates
endRender(2)
assert.equal(nativeInstancePool.length,2)
endRender()
assert.equal(nativeInstancePool.length,2)
assert.equal(firstReleased+secondReleased,0)

// On the next render only the inactive tail is retired. The retained slot
// remains reusable; none of the application-owned assets is disposed.
beginRender()
render([a,b])
endRender()
assert.equal(nativeInstancePool.length,1)
assert.equal(nativeInstancePool[0],firstSlot)
assert.equal(secondReleased,1)
assert.equal(firstReleased,0)
beginRender()
render([])
endRender()
assert.equal(nativeInstancePool.length,0)
assert.equal(firstReleased,1)
assert.equal(sharedDisposed,0)

// Snapshot hook values in their defining modules without constructing any
// objects, consuming UUID randomness, or advancing global object/material IDs.
for (const [name, relative, properties] of [
  ['Object3D','core/Object3D.js',['onBeforeRender','onAfterRender']],
  ['Material','materials/Material.js',['onBeforeRender','onBeforeCompile','customProgramCacheKey']],
]) {
  const classSource = `class ${name} { constructor(){ throw new Error('Snapshot constructed an object') } ${properties.map(key=>`${key}(){}`).join(' ')} }`
  const captured = transformCanonicalInstanceHooks(classSource, `/three/src/${relative}`)
  const exported = [...captured.matchAll(/export const (\w+) =/g)].map(match=>match[1])
  assert.equal(exported.length,properties.length)
  const evaluate = new Function(`${captured.replaceAll('export const ','const ')};return {constructor: ${name}, callbacks:[${exported.join(',')}]};`)
  const values = evaluate()
  properties.forEach((key,index)=>assert.equal(values.callbacks[index],values.constructor.prototype[key]))
  values.constructor.prototype[properties[0]] = ()=>{}
  assert.notEqual(values.callbacks[0],values.constructor.prototype[properties[0]])
}

// Exercise the real transformed disposal listener, not just a pool mock.
// Removing a batch releases its attribute buffers, binding states and cache
// entry while leaving its shared geometry/material available to the scene.
const objectsFile = fileURLToPath(new URL('../node_modules/three/src/renderers/webgl/WebGLObjects.js',import.meta.url))
const objectsSource = transform({fileName:objectsFile,text:fs.readFileSync(objectsFile,'utf8')})
const objectsFactory = new Function('BufferGeometry','InstancedMesh','WeakMap',
  objectsSource.replace(/^import .*;\n/gm,'').replace('export { WebGLObjects };','return WebGLObjects;'))
const deletedEntries = []
class ObservedWeakMap extends WeakMap {
  delete(key) { deletedEntries.push(key); return super.delete(key) }
}
const releasedObjects = [], removedAttributes = []
const objects = objectsFactory(THREE.BufferGeometry,THREE.InstancedMesh,ObservedWeakMap)(
  {ARRAY_BUFFER:34962}, {get:(_object,geometry)=>geometry,update(){}},
  {update(){},remove:attribute=>removedAttributes.push(attribute)},
  {releaseStatesOfObject:object=>releasedObjects.push(object)}, {render:{frame:1}})
const disposable = new THREE.InstancedMesh(geometry,material,2)
disposable.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(6),3)
objects.update(disposable)
assert.equal(disposable._listeners.dispose.length,1)
disposable.dispose()
assert.deepEqual(releasedObjects,[disposable])
assert.deepEqual(removedAttributes,[disposable.instanceMatrix,disposable.instanceColor])
assert.deepEqual(deletedEntries,[disposable])
assert.equal(disposable._listeners.dispose.length,0)
assert.equal(sharedDisposed,0)
console.log('Automatic instancing: contiguous draws collapse; transforms, view uploads, ordering, hooks, shadows and fallback contracts pass')
