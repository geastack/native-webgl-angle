// Verification-only wrapper plugin for BatchedMesh native typing work.
//
// It imports the base plugin's default export, wraps `configure()` so its
// `hostShims.transformSource` runs first (every other transform the base
// plugin applies still happens), and then layers these adaptations on top:
//
//   - `core/Object3D.js` -> expose the documented native callback arguments
//   - `math/FrustumArray.js` -> check pool extent before native element reads
//   - `objects/BatchedMesh.js`  -> `transformBatchedMesh`
//   - `renderers/WebGLRenderer.js` -> `transformBatchedRendererBranch`
//     (replacing the base plugin's current "BatchedMesh is not supported"
//     stub with the typed uniform branch)
//
// These rewrites remain experimental until native execution and renderer
// callback dispatch pass. This wrapper is excluded from the published package.

import basePlugin from './geatsc-plugin.mjs'
import { transformBatchedMesh, transformBatchedRendererBranch } from './geatsc-plugin-batched-mesh.mjs'

const replaceOne = (text, before, after, fileName, description) => {
  if (!text.includes(before)) throw new Error(`Three ${description} source at ${fileName} no longer matches the native adaptation`)
  return text.replace(before, after)
}

export default {
  name: 'native-webgl-angle-host-batched-probe',
  configure() {
    const base = basePlugin.configure()
    const baseTransformSource = base.hostShims.transformSource

    const transformSource = ({ fileName, text }) => {
      const normalized = fileName.replaceAll('\\', '/')
      const baseResult = baseTransformSource({ fileName, text })
      let transformed = baseResult === null ? text : baseResult

      if (process.env.GEA_WEBGL_AUTO_INSTANCE_TEST === '1' && normalized.endsWith('/three-batched-mesh/index.tsx')) {
        transformed = replaceOne(transformed, 'native-webgl-angle/test/batched-render-scene',
          'native-webgl-angle/test/auto-instanced-render-scene', fileName, 'automatic instancing validation scene');
      }

      // Three documents these callback arguments but comments them out of the
      // base no-op definitions. Keep the real callback ABI visible to native
      // override dispatch and to callers holding an Object3D reference.
      if (normalized.endsWith('/three/src/core/Object3D.js')) {
        transformed = transformed.replaceAll('@param {Object} group - The geometry group data.',
          '@param {{start:number,count:number,materialIndex?:number}|null} group - The geometry group data.')
        for (const name of ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow']) {
          const shadow = name.endsWith('Shadow')
          const parameters = shadow
            ? 'renderer, object, camera, shadowCamera, geometry, depthMaterial, group'
            : 'renderer, scene, camera, geometry, material, group'
          transformed = replaceOne(transformed, `${name}( /* ${parameters} */ ) {}`,
            `${name}( ${parameters} ) {}`, fileName, `Object3D ${name} declared callback arguments`)
          if (!shadow) {
            // Scene calls this inherited no-op with a render target in slot
            // four and omits material/group. Mesh calls supply all six slots.
            const signature = `${name}( ${parameters} ) {}`
            const start = transformed.lastIndexOf('/**', transformed.indexOf(signature))
            const end = transformed.indexOf(signature)
            const comment = transformed.slice(start, end)
              .replace('@param {BufferGeometry} geometry', "@param {BufferGeometry|import('../renderers/WebGLRenderTarget.js').WebGLRenderTarget|null} geometry")
              .replace('@param {Material} material', '@param {Material} [material]')
              .replace('} group -', '} [group] -')
            transformed = transformed.slice(0, start) + comment + transformed.slice(end)
          }
        }
      }

      if (normalized.endsWith('/three/src/objects/BatchedMesh.js')) {
        transformed = transformBatchedMesh(transformed, fileName, replaceOne)
      }

      if (normalized.endsWith('/three/src/math/FrustumArray.js')) {
        // The pool grows sequentially. Test its extent before reading a native
        // element; retain Three's missing-entry test for existing JS slots.
        const before = 'if ( frustums[ i ] === undefined ) frustums[ i ] = new Frustum();'
        const after = 'if ( i >= frustums.length || frustums[ i ] === undefined ) frustums[ i ] = new Frustum();'
        for (let occurrence = 0; occurrence < 2; occurrence++) {
          transformed = replaceOne(transformed, before, after, fileName, 'FrustumArray pool extent before element read')
        }
      }

      if (normalized.endsWith('/three/src/renderers/WebGLRenderer.js')) {
        transformed = transformBatchedRendererBranch(transformed, fileName, replaceOne)
      }

      return transformed === text ? null : transformed
    }

    return {
      ...base,
      hostShims: {
        ...base.hostShims,
        transformSource,
      },
    }
  },
}
