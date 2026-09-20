// Generic, opt-in render-list instancing. Only already-adjacent opaque draws
// with the same native geometry/material are candidates. No scene mutation.
export const nativeInstanceHelpers = `
/** @param {import('../core/Object3D.js').Object3D} object @return {boolean} */
function nativeInstanceTransformSupported( object ) {
	const e = object.matrixWorld.elements;
	const x = e[0]*e[0] + e[1]*e[1] + e[2]*e[2];
	const y = e[4]*e[4] + e[5]*e[5] + e[6]*e[6];
	const z = e[8]*e[8] + e[9]*e[9] + e[10]*e[10];
	// Three's instanced normal transform supports positive TRS, not shear.
	return e[3] === 0 && e[7] === 0 && e[11] === 0 && e[15] === 1 &&
		x > 0 && y > 0 && z > 0 && object.matrixWorld.determinant() > 0 &&
		Math.abs(e[0]*e[4] + e[1]*e[5] + e[2]*e[6]) <= 1e-10 * Math.sqrt(x*y) &&
		Math.abs(e[0]*e[8] + e[1]*e[9] + e[2]*e[10]) <= 1e-10 * Math.sqrt(x*z) &&
		Math.abs(e[4]*e[8] + e[5]*e[9] + e[6]*e[10]) <= 1e-10 * Math.sqrt(y*z);
}
`;

export function transformAutomaticInstancing(text, fileName, replaceOne, renderItemType) {
  text = `import { nativeInstanceBeforeRender, nativeInstanceAfterRender } from '../core/Object3D.js';\nimport { nativeInstanceMaterialBeforeRender, nativeInstanceBeforeCompile, nativeInstanceProgramCacheKey } from '../materials/Material.js';\nimport { InstancedBufferAttribute } from '../core/InstancedBufferAttribute.js';\nimport { InterleavedBufferAttribute } from '../core/InterleavedBufferAttribute.js';\nimport { InstancedInterleavedBuffer } from '../core/InstancedInterleavedBuffer.js';\nimport { InstancedMesh } from '../objects/InstancedMesh.js';\nimport { Mesh } from '../objects/Mesh.js';\n${nativeInstanceHelpers}\n` + text;
  const before = `\t\tfunction renderObjects( renderList, scene, camera ) {`;
  const start = text.indexOf(before);
  const end = text.indexOf('\n\t\tfunction renderObject(', start);
  if (start < 0 || end < 0) throw new Error(`Three renderObjects source at ${fileName} no longer matches`);
  const replacement = `
		const nativeInstanceMatrix = new Matrix4();
		let nativeInstanceUsed = 0;
		/** @type {InstancedMesh[]} */
		const nativeInstancePool = [];
		/** @param {${renderItemType}} item */
		function nativeCanInstanceMaterial( item ) {
			const material = item.material;
			// The pooled mesh must not inherit callbacks installed specifically
			// on InstancedMesh, even when the source meshes keep canonical hooks.
			if (InstancedMesh.prototype.onBeforeRender !== nativeInstanceBeforeRender ||
				InstancedMesh.prototype.onAfterRender !== nativeInstanceAfterRender) return false;
			if (material.isShaderMaterial || material.isRawShaderMaterial || material.isNodeMaterial ||
				// Object-space normal maps use only the uniform normalMatrix in
				// Three's fragment shader, bypassing per-instance normal transforms.
				(material.normalMap && material.normalMapType === 1 /* ObjectSpaceNormalMap */) ||
				material.transparent || !material.depthWrite || !material.depthTest ||
				material.stencilWrite || material.wireframe || material.blending !== 1 ||
				material.onBeforeRender !== nativeInstanceMaterialBeforeRender ||
				material.onBeforeCompile !== nativeInstanceBeforeCompile ||
				material.customProgramCacheKey !== nativeInstanceProgramCacheKey) return false;
			if (!(material.type === 'MeshBasicMaterial' || material.type === 'MeshLambertMaterial' ||
				material.type === 'MeshPhongMaterial' || material.type === 'MeshStandardMaterial')) return false;
			if (item.geometry.isInstancedBufferGeometry || Object.keys(item.geometry.morphAttributes).length !== 0) return false;
			const names = Object.keys(item.geometry.attributes);
			if (names.length > 8) return false;
			for (let i = 0; i < names.length; i++) {
				const attribute = item.geometry.getAttribute(names[i]);
				if (attribute instanceof InstancedBufferAttribute ||
					(attribute instanceof InterleavedBufferAttribute && attribute.data instanceof InstancedInterleavedBuffer)) return false;
			}
			return true;
		}
		/** @param {${renderItemType}} item @param {import('../cameras/Camera.js').Camera} camera */
		function nativeCanInstance( item, camera ) {
			const object = item.object;
			return object instanceof Mesh && !(object instanceof InstancedMesh) && !object.isSkinnedMesh && !object.isBatchedMesh && object.type === 'Mesh' &&
				item.group === null && object.layers.test(camera.layers) &&
				object.onBeforeRender === nativeInstanceBeforeRender &&
				object.onAfterRender === nativeInstanceAfterRender &&
				object.morphTargetInfluences === undefined && nativeInstanceTransformSupported(object);
		}

		/** @param {${renderItemType}[]} renderList */
		function renderObjects( renderList, scene, camera ) {
			const overrideMaterial = scene.isScene === true ? scene.overrideMaterial : null;
			let batchIndex = 0;
			for (let i = 0, l = renderList.length; i < l; i++) {
				const item = renderList[i];
				const object = item.object;
				const geometry = item.geometry;
				const group = item.group;
				let material = item.material;
				if (material.allowOverride === true && overrideMaterial !== null) material = overrideMaterial;
				if (!object.layers.test(camera.layers)) continue;
				let end = i + 1;
				// Reject singleton runs before inspecting attributes. Those checks
				// enumerate keys and would otherwise allocate for every ordinary draw.
				if (end < l && renderList[end].geometry === geometry && renderList[end].material === material &&
					overrideMaterial === null && !_this.localClippingEnabled && currentRenderState.state.lightProbeGridArray.length === 0 && nativeCanInstanceMaterial(item) && nativeCanInstance(item, camera)) {
					while (end < l) {
						const next = renderList[end];
						if (next.geometry !== geometry || next.material !== material ||
							next.groupOrder !== item.groupOrder || next.renderOrder !== item.renderOrder ||
							next.object.receiveShadow !== object.receiveShadow || !nativeCanInstance(next, camera)) break;
						end++;
					}
				}
				const count = end - i;
				if (count < 2) {
					renderObject(object, scene, camera, geometry, material, group);
					continue;
				}
				if (batchIndex >= nativeInstancePool.length) {
					nativeInstancePool.push(new InstancedMesh(geometry, material, Math.max(16, count)));
				}
				let batch = nativeInstancePool[batchIndex];
				if (batch.instanceMatrix.count < count) {
					batch.dispose();
					batch = new InstancedMesh(geometry, material, Math.max(count, batch.instanceMatrix.count * 2));
					nativeInstancePool[batchIndex] = batch;
				}
				batchIndex++;
				nativeInstanceUsed = Math.max(nativeInstanceUsed, batchIndex);
				batch.geometry = geometry;
				batch.material = material;
				batch.count = count;
				batch.receiveShadow = object.receiveShadow;
				// Keep visible coordinates near the camera before Float32 upload.
				// A distant first instance must not quantize nearby later instances.
				const origin = camera.matrixWorld.elements;
				const originX = origin[12], originY = origin[13], originZ = origin[14];
				batch.matrixWorld.makeTranslation(originX, originY, originZ);
				for (let j = i; j < end; j++) {
					const original = renderList[j].object;
					nativeInstanceMatrix.copy(original.matrixWorld);
					const relative = nativeInstanceMatrix.elements;
					relative[12] -= originX;
					relative[13] -= originY;
					relative[14] -= originZ;
					batch.setMatrixAt(j - i, nativeInstanceMatrix);
					// Retain Three's observable per-object camera matrices.
					original.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, original.matrixWorld);
					original.normalMatrix.getNormalMatrix(original.modelViewMatrix);
				}
				batch.instanceMatrix.needsUpdate = true;
				objects.update(batch);
				// A renderer can submit several views in one frame. WebGLObjects'
				// once-per-frame guard must not hide updated instance matrices.
				attributes.update(batch.instanceMatrix, _gl.ARRAY_BUFFER);
				renderObject(batch, scene, camera, geometry, material, null);
				i = end - 1;
			}
		}
`;
  text = text.slice(0, start) + replacement + text.slice(end);
  text = replaceOne(text, '\t\tthis.render = /** @this {WebGLRenderer} */ function ( scene, camera ) {',
    '\t\tthis.render = /** @this {WebGLRenderer} */ function ( scene, camera ) {\n\t\t\tif (renderListStack.length === 0) nativeInstanceUsed = 0;', fileName, 'instance pool per-render usage');
  text = replaceOne(text, '\t\t\tbindingStates.resetDefaultState();',
    '\t\t\tif (renderListStack.length === 1) {\n\t\t\t\twhile (nativeInstancePool.length > nativeInstanceUsed) {\n\t\t\t\t\tnativeInstancePool[nativeInstancePool.length - 1].dispose();\n\t\t\t\t\tnativeInstancePool.pop();\n\t\t\t\t}\n\t\t\t}\n\t\t\tbindingStates.resetDefaultState();', fileName, 'unused instance pool disposal');
  return replaceOne(text, '\t\tthis.dispose = function () {',
    '\t\tthis.dispose = function () {\n\t\t\tfor (let i = 0; i < nativeInstancePool.length; i++) nativeInstancePool[i].dispose();\n\t\t\tnativeInstancePool.length = 0;', fileName, 'renderer instance pool disposal');
}

export function transformCanonicalInstanceHooks(text, fileName) {
  if (fileName.endsWith('/three/src/core/Object3D.js')) {
    return text + `\nexport const nativeInstanceBeforeRender = Object3D.prototype.onBeforeRender;
export const nativeInstanceAfterRender = Object3D.prototype.onAfterRender;\n`;
  }
  if (fileName.endsWith('/three/src/materials/Material.js')) {
    return text + `\nexport const nativeInstanceMaterialBeforeRender = Material.prototype.onBeforeRender;
export const nativeInstanceBeforeCompile = Material.prototype.onBeforeCompile;
export const nativeInstanceProgramCacheKey = Material.prototype.customProgramCacheKey;\n`;
  }
  return text;
}
