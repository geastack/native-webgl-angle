import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import probe from '../geatsc-plugin-batched-probe.mjs'

const three = new URL('./', import.meta.resolve('three/src/constants.js'))
const url = new URL('math/FrustumArray.js', three)
const { FrustumArray: Upstream } = await import(url)
const { ArrayCamera } = await import(new URL('cameras/ArrayCamera.js', three))
const { PerspectiveCamera } = await import(new URL('cameras/PerspectiveCamera.js', three))
const { Vector3 } = await import(new URL('math/Vector3.js', three))
const text = probe.configure().hostShims.transformSource({ fileName: fileURLToPath(url), text: fs.readFileSync(url, 'utf8') })
const executable = text.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,
  (_, quote, specifier) => `from ${quote}${new URL(specifier, url).href}${quote}`)
const { FrustumArray: Adapted } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`)
function exercise(FrustumArray) {
  const cameras = [0, 100].map(x => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.set(x, 0, 10)
    camera.updateMatrixWorld()
    return camera
  })
  const array = new ArrayCamera(cameras)
  const pool = new FrustumArray()
  const results = []
  const observe = () => results.push([pool._count, pool.containsPoint(new Vector3()), pool.containsPoint(new Vector3(100, 0, 0))])
  pool.setFromArrayCamera(array)
  observe()
  array.cameras = []
  pool.setFromArrayCamera(array)
  observe()
  array.cameras = [cameras[0]]
  // Keep upstream missing-entry behavior as well as sequential native growth.
  delete pool._frustums[0]
  pool.setFromArrayCamera(array)
  observe()
  const clone = pool.clone()
  results.push([clone._count, clone.containsPoint(new Vector3()), clone.containsPoint(new Vector3(100, 0, 0))])
  return results
}
const expected = [[2, true, true], [0, false, false], [1, true, false], [1, true, false]]
assert.deepEqual(exercise(Upstream), expected)
assert.deepEqual(exercise(Adapted), expected)
console.log('Native FrustumArray adaptation preserves growth, empty cameras, missing slots and copy behavior')
